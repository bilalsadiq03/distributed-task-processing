import "dotenv/config";
import { buildApp } from "./app";

const app = buildApp();

const port = Number(process.env.API_PORT ?? 3000);
const host = process.env.API_HOST ?? '0.0.0.0';

const start = async() => {
    try {
        await app.listen({
            port,
            host,
        });
    }
    catch(err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();