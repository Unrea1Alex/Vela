#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <windows.h>
#include <stdlib.h>
#include "../../vela/ffi.h"

enum { capacity = 8192 };
typedef struct {
    SOCKET socket;
    int port, error, size;
    unsigned char buffer[capacity];
} Socket;

VELA_FFI_EXPORT int32_t vela_ffi_abi_version(void) { return VELA_FFI_ABI_VERSION; }

/* Each socket owns one Winsock startup reference. */
static Socket *owned_socket(SOCKET raw) {
    Socket *result = NULL;
    u_long nonblocking = 1;
    if (raw == INVALID_SOCKET) {
        WSACleanup();
        return NULL;
    }
    if (SetHandleInformation((HANDLE)raw, HANDLE_FLAG_INHERIT, 0)
            && ioctlsocket(raw, FIONBIO, &nonblocking) == 0) {
        result = calloc(1, sizeof(*result));
        if (result) result->socket = raw;
    }
    if (!result) {
        closesocket(raw);
        WSACleanup();
    }
    return result;
}
VELA_FFI_EXPORT void server_socket_close(void *handle) {
    Socket *socket = handle;
    if (!socket) return;
    closesocket(socket->socket);
    WSACleanup();
    free(socket);
}
VELA_FFI_EXPORT void *server_listen(int64_t port) {
    WSADATA data;
    Socket *listener;
    struct sockaddr_in address = {0};
    int size = sizeof(address);
    BOOL exclusive = TRUE;
    if (port < 0 || port > 65535 || WSAStartup(MAKEWORD(2, 2), &data)) return NULL;
    listener = owned_socket(WSASocketW(AF_INET, SOCK_STREAM, IPPROTO_TCP,
        NULL, 0, WSA_FLAG_NO_HANDLE_INHERIT));
    if (!listener) return NULL;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    address.sin_port = htons((u_short)port);
    if (setsockopt(listener->socket, SOL_SOCKET, SO_EXCLUSIVEADDRUSE,
            (const char *)&exclusive, sizeof(exclusive))
            || bind(listener->socket, (const struct sockaddr *)&address, sizeof(address))
            || listen(listener->socket, 16)
            || getsockname(listener->socket, (struct sockaddr *)&address, &size)) {
        server_socket_close(listener);
        return NULL;
    }
    listener->port = ntohs(address.sin_port);
    return listener;
}
VELA_FFI_EXPORT int64_t server_port(void *handle) {
    return ((Socket *)handle)->port;
}
VELA_FFI_EXPORT int64_t server_socket_error(void *handle) {
    return ((Socket *)handle)->error;
}
VELA_FFI_EXPORT void *server_accept(void *handle) {
    Socket *listener = handle;
    Socket *client;
    WSADATA data;
    SOCKET raw;
    listener->error = 0;
    raw = accept(listener->socket, NULL, NULL);
    if (raw == INVALID_SOCKET) {
        int error = WSAGetLastError();
        if (error != WSAEWOULDBLOCK) listener->error = error;
        return NULL;
    }
    if (WSAStartup(MAKEWORD(2, 2), &data)) {
        closesocket(raw);
        listener->error = WSASYSNOTREADY;
        return NULL;
    }
    client = owned_socket(raw);
    if (!client) listener->error = WSAENOBUFS;
    return client;
}
VELA_FFI_EXPORT int64_t server_receive(void *handle) {
    Socket *client = handle;
    int size = recv(client->socket, (char *)client->buffer, capacity, 0);
    client->size = size > 0 ? size : 0;
    if (size != SOCKET_ERROR) return size;
    return WSAGetLastError() == WSAEWOULDBLOCK ? -1 : -2;
}
VELA_FFI_EXPORT int64_t server_byte(void *handle, int64_t index) {
    const Socket *client = handle;
    if (index < 0 || index >= client->size) return -1;
    return client->buffer[index];
}
VELA_FFI_EXPORT int64_t server_send(void *handle, VelaBytes bytes) {
    Socket *client = handle;
    int size;
    if (bytes.length > capacity) return -2;
    size = send(client->socket, bytes.data, (int)bytes.length, 0);
    if (size != SOCKET_ERROR) return size;
    return WSAGetLastError() == WSAEWOULDBLOCK ? -1 : -2;
}
