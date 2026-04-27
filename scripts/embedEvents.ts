import { pipeline, Tensor } from '@xenova/transformers';

export interface EventData {
    name: string;
    startDate: string | Date;
    endDate?: string | Date;
    organizer: { name: string };
    url?: string;
    genre?: string;
    embedding?: number[];
}

let extractor = null as any;

async function loadExtractor() {
    if (!extractor) {
        extractor = await pipeline('feature-extraction', 'Xenova/bge-large-en-v1.5');
    }
    return extractor;
}

async function generateEventEmbedding(event: EventData): Promise<number[]> {
    const extractor = await loadExtractor();

    const eventString = `Event: ${event.name}, Organizer: ${event.organizer.name}, Genre: ${event.genre}`;
    const output: Tensor = await extractor(eventString, {
        pooling: 'mean',
        normalize: true,
    });
    const nested = output.tolist() as number[][];
    return nested[0];
}

export async function embedEvents(events: EventData[]) {
    console.log(`${events.length} events being embedded!`);

    const results: EventData[] = [];
    for (let i = 0; i < events.length; i++) {
        const percent = Math.round(((i + 1) / events.length) * 100);
        const bar = '█'.repeat(Math.round(percent / 5)).padEnd(20, '░');
        process.stdout.write(`\r[${bar}] ${percent}% | ${i + 1}/${events.length}`);

        const embedding = await generateEventEmbedding(events[i]);
        results.push({ ...events[i], embedding });
    }

    console.log();
    return results;
}