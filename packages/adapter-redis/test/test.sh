#!/usr/bin/env bash

CONTAINER_NAME=authjs-redis-test

# Start db
docker run -d --rm \
  -p 6379:6379 \
  --name ${CONTAINER_NAME} \
  redis

echo "Waiting 10s for redis to start..." && sleep 5

# Always stop container, but exit with 1 when tests are failing
if vitest run -c ../utils/vitest.config.ts; then
  docker stop ${CONTAINER_NAME}
else
  docker stop ${CONTAINER_NAME} && exit 1
fi
