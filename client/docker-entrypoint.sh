#!/bin/sh
set -e
# Read the DNS resolver from the container's resolv.conf so nginx can
# re-resolve the upstream hostname on each request (handles Railway IP changes).
RESOLVER=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
export RESOLVER
envsubst '${API_UPSTREAM} ${RESOLVER}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
