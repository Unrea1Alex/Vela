#define _GNU_SOURCE
#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

typedef struct {
    unsigned long long root_rss, tree_rss;
    unsigned members;
} memory;

static double now_ms(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts)) exit(2);
    return 1000.0 * ts.tv_sec + ts.tv_nsec / 1000000.0;
}

static double cpu_ms(struct timeval tv) {
    return 1000.0 * tv.tv_sec + tv.tv_usec / 1000.0;
}

static memory sample(pid_t leader, unsigned long page_size, int terminate) {
    memory result = {0};
    DIR *proc = opendir("/proc");
    struct dirent *entry;
    if (!proc) exit(2);
    while ((entry = readdir(proc))) {
        char path[300], line[2048], state;
        long parent, group, session;
        unsigned long pages;
        FILE *file;
        if (!isdigit((unsigned char)entry->d_name[0])) continue;
        snprintf(path, sizeof(path), "/proc/%s/stat", entry->d_name);
        file = fopen(path, "r");
        if (!file) continue;
        char *name_end = fgets(line, sizeof(line), file) ? strrchr(line, ')') : NULL;
        fclose(file);
        if (!name_end || sscanf(name_end + 1, " %c %ld %ld %ld", &state, &parent, &group, &session) != 4 || session != leader)
            continue;
        if (state == 'Z') continue;
        pid_t pid = (pid_t)strtol(entry->d_name, NULL, 10);
        ++result.members;
        if (terminate) {
            kill(pid, SIGKILL);
            continue;
        }
        snprintf(path, sizeof(path), "/proc/%s/statm", entry->d_name);
        file = fopen(path, "r");
        if (!file) continue;
        int read_rss = fscanf(file, "%*s %lu", &pages);
        fclose(file);
        if (read_rss != 1) continue;
        unsigned long long bytes = (unsigned long long)pages * page_size;
        result.tree_rss += bytes;
        if (pid == leader) result.root_rss = bytes;
    }
    closedir(proc);
    return result;
}

int main(int argc, char **argv) {
    if (argc < 5) return 2;
    long timeout = strtol(argv[1], NULL, 10);
    long page_size = sysconf(_SC_PAGESIZE);
    if (timeout <= 0 || page_size <= 0) return 2;
    int out = open(argv[2], O_WRONLY | O_CREAT | O_TRUNC, 0600);
    int err = open(argv[3], O_WRONLY | O_CREAT | O_TRUNC, 0600);
    if (out < 0 || err < 0) return 2;
    sigset_t signals;
    sigemptyset(&signals);
    sigaddset(&signals, SIGCHLD);
    if (sigprocmask(SIG_BLOCK, &signals, NULL)) return 2;
    double start = now_ms();
    pid_t child = fork();
    if (child < 0) return 2;
    if (child == 0) {
        if (setsid() < 0 || dup2(out, STDOUT_FILENO) < 0 || dup2(err, STDERR_FILENO) < 0 ||
            sigprocmask(SIG_UNBLOCK, &signals, NULL)) _exit(125);
        close(out);
        close(err);
        execvp(argv[4], &argv[4]);
        perror(argv[4]);
        _exit(127);
    }
    close(out);
    close(err);
    int status, timed_out = 0;
    struct rusage usage;
    memory peak = {0};
    for (;;) {
        pid_t ended = wait4(child, &status, WNOHANG, &usage);
        if (ended == child) break;
        if (ended < 0) return 2;
        if (now_ms() - start > timeout) {
            timed_out = 1;
            (void)sample(child, (unsigned long)page_size, 1);
            kill(child, SIGKILL);
            if (wait4(child, &status, 0, &usage) != child) return 2;
            break;
        }
        memory point = sample(child, (unsigned long)page_size, 0);
        if (point.root_rss > peak.root_rss) peak.root_rss = point.root_rss;
        if (point.tree_rss > peak.tree_rss) peak.tree_rss = point.tree_rss;
        if (point.members > peak.members) peak.members = point.members;
        const struct timespec interval = {0, 5000000};
        if (sigtimedwait(&signals, NULL, &interval) < 0 && errno != EAGAIN && errno != EINTR) return 2;
    }
    double wall = now_ms() - start;
    memory remaining = sample(child, (unsigned long)page_size, 1);
    unsigned long long max_one = (unsigned long long)usage.ru_maxrss * 1024;
    if (max_one > peak.tree_rss) peak.tree_rss = max_one;
    char root_rss[32] = "null";
    if (peak.root_rss) snprintf(root_rss, sizeof(root_rss), "%llu", peak.root_rss);
    int code = WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
    printf("{\"wall_ms\":%.3f,\"cpu_ms\":%.3f,\"peak_process_rss_bytes\":%s,"
           "\"peak_tree_rss_bytes\":%llu,\"peak_single_rss_wait4_bytes\":%llu,"
           "\"observed_processes\":%u,\"active_processes_after\":%u,"
           "\"timed_out\":%s,\"exit_code\":%d}\n",
           wall, cpu_ms(usage.ru_utime) + cpu_ms(usage.ru_stime),
           root_rss, peak.tree_rss, max_one, peak.members, remaining.members,
           timed_out ? "true" : "false", code);
    return 0;
}
