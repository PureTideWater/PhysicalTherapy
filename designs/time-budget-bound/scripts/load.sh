#!/bin/sh
# load.sh N [mem]: start N busy processes (mem = each also walks a 128 MB buffer); prints pids. Kill with: pkill -f tbb-load
N=$1; KIND=${2:-cpu}
for i in $(seq 1 $N); do
  if [ "$KIND" = mem ]; then node -e '/*tbb-load*/const b=new Uint32Array(32e6);let s=0;for(;;){for(let i=0;i<b.length;i+=16){b[i]=s++;}}' &
  else node -e '/*tbb-load*/for(;;){}' & fi
done
