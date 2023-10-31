import { Router, Request, Response } from 'express';
import type { EmbedderInput } from './embedder';
import { orchestrate } from './orchestrator';
import { test } from './testPinecone';
const router: Router = Router();

function generateInputs(n: number): EmbedderInput[] {
    const inputs: EmbedderInput[] = [];
    for (let i = 0; i < n; i++) {
        inputs.push({
            text: "hello",
            metadata: {
                title: "hello",
                url: "hello"
            }
        });
    }
    return inputs;
}

router.get('/embedAndUpsert', async (req: Request, res: Response) => {
    const inputs = generateInputs(100);
    const mode = req.query.mode as string ?? "serial"
    await orchestrate<Metadata>(inputs, mode);
    res.status(200).send("ok");
});

router.get('/test', async (req: Request, res: Response) => {
    try {
        await test()
        res.status(200).send("ok");
    } catch (e) {
        res.status(500).send(e)
    }
})

router.get('/health', (req: Request, res: Response) => {
    res.status(200).send("Healthy");
});


export default router;

