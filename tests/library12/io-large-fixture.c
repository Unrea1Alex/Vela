#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int main(int argc,char **argv){char buffer[1048576];FILE *f;int i,mb;if(argc!=3)return 2;mb=atoi(argv[2]);if(mb!=27&&mb!=270)return 3;memset(buffer,'a',sizeof buffer);for(i=1023;i<(int)sizeof buffer;i+=1024)buffer[i]='\n';f=fopen(argv[1],"wb");if(!f)return 4;for(i=0;i<mb;i++)if(fwrite(buffer,1,sizeof buffer,f)!=sizeof buffer)return 5;return fclose(f)?6:0;}
