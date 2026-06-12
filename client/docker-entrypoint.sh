#!/bin/sh
set -e
RESOLVER=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
# Nginx requires IPv6 resolver addresses in square brackets
if echo "$RESOLVER" | grep -q ':'; then
    RESOLVER="[$RESOLVER]"
fi
export RESOLVER
envsubst '${API_UPSTREAM} ${RESOLVER}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
