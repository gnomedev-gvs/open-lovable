FROM node:22.23.2-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends zip \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /home/node/app \
    && chown -R node:node /home/node/app

USER node
WORKDIR /home/node/app
RUN npm init -y >/dev/null \
    && npm install --no-audit --no-fund --save-exact \
      react@18.2.0 react-dom@18.2.0 \
      vite@4.5.14 @vitejs/plugin-react@4.3.4 \
      tailwindcss@3.4.17 postcss@8.4.49 autoprefixer@10.4.20 \
    && npm cache clean --force

CMD ["node"]
