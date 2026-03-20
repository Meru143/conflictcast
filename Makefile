.PHONY: build test lint docker dev

build:
	npm run build

test:
	npm run test

lint:
	npm run lint

docker:
	docker build -t conflictcast .

dev:
	docker compose up --build
