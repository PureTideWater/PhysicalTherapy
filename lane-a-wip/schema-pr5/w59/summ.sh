#!/bin/bash
# W59: per label, the timed runs' count, median, min and max in ms, from a session's output (RUN line, then Time line).
awk '/^RUN /{k=$0; sub(/ run=[0-9]+$/,"",k); next} /^(stored)?$/{next} /^Time:/{ if(k!=""){ n[k]++; v[k]=v[k]" "$2; k="" } next } /ERROR/{print "ERROR: "$0}
END{ for(k in n){ m=split(v[k],a," "); for(i=1;i<=m;i++)for(j=i+1;j<=m;j++)if(a[j]+0<a[i]+0){t=a[i];a[i]=a[j];a[j]=t}; printf "%s: n=%d median %.0f ms (min %.0f, max %.0f)\n", k, m, a[int((m+1)/2)], a[1], a[m] } }' "$@" | sort
