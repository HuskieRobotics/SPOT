FROM node
LABEL Name="spot"
LABEL Version="4.1.1"

WORKDIR /app
COPY . ./

RUN npm install

EXPOSE 8080
CMD ["node", "."]