FROM node:22-alpine
WORKDIR /app
COPY server.js .
ENV SITE_DIR=/site SERVE_SITE=1 PORT=8901
EXPOSE 8901
CMD ["node", "server.js"]
