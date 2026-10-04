import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";


export default fp(async (app) => {
    const secret = process.env.JWT_SECRET;

    if(!secret) 
        throw new Error("JWT secret is not defined")

    await app.register(fastifyJwt, {
        secret,
        sign: {
            expiresIn: '1h',
        },
    });
});