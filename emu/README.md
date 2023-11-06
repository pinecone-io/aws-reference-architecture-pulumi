# EMU (Embedding + Upsert) Service

![EMU The embedding and upsert service](./docs/emu-hero-image.webp)

## Building the Docker image

1. Ensure you're running node v20.00

Recommend using a node version manager such as [`n`](https://github.com/tj/n).

1. Ensure you've got `pnpm` installed. [Installation docs](https://pnpm.io/installation).

1. Ensure you have the correct version of `pnpm` expected by `package.json`.

You can add the specific version requiured by emu by running `pnpm add -g pnpm@8.6.12`.

1. Install npm packages

`pnpm i`

1. Perform a build to produce the `/dist` directory

`pnpm run build`

1. Build the Docker image

`docker build . -t emu:latest`
