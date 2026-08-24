FROM node:22.23.2-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends zip \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /home/node/app \
    && chown -R node:node /home/node/app

USER node
WORKDIR /home/node/app

CMD ["node"]
