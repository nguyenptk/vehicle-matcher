install:
	npm install express axios dotenv @prisma/client morgan
	npm install --save-dev \
	  typescript ts-node prisma \
	  @types/express @types/node @types/morgan
	npx prisma generate

test:
	npx ts-node src/test.ts

up:
	docker-compose up --build -d

down:
	docker-compose down -v

clean:
	rm -rf node_modules dist
