FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173
# --host 0.0.0.0 для прослушивания Vite внутри контейнера
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
