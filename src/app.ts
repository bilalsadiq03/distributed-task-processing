import Fastify from "fastify";

export function buildApp(){
    const app = Fastify({
        logger: true,
    });

    app.get('/', async() => {
        return {
            message: "Distrubuted task processing platform",
        };
    });

    app.get('/api/v1/health', async() => {
        return {
            status: "ok",
        };
    });

    return app;
}