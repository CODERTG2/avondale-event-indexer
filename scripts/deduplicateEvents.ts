import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { callGroq } from '../src/utils/groqClient.ts';

interface EventData {
    name: string;
    startDate: string;
    endDate?: string;
    organizer: { name: string };
    url?: string;
    genres?: string[];
}

async function groqDeduplicate(events: { id: number; name: string; organizer: string; startDate?: string }[]) {
    const systemPrompt = `
            You are an expert at deduplicating events. Return a JSON object containing an "events" array. The array should contain ONLY the unique events. Remove duplicated/repeated events, especially those with the exact same name, organizer, and date. Preserve the original "id". Example: {"events": [{"id": 0}, {"id": 2}]}
          `;
    const userPrompt = `Deduplicate these events and return a JSON object with an "events" array: ${JSON.stringify(events)}`;
    return callGroq(systemPrompt, userPrompt);
}

async function deduplicateEvents(events: EventData[]) {
    const eventsWithId = events.map((e, idx) => ({ ...e, originalId: idx }));

    const eventsByGenre: Record<string, typeof eventsWithId> = {};
    for (const event of eventsWithId) {
        const genre = event.genres[0];
        if (!eventsByGenre[genre]) {
            eventsByGenre[genre] = [];
        }
        eventsByGenre[genre].push(event);
    }

    const deduplicatedResults: EventData[] = [];

    for (const [genre, genreEvents] of Object.entries(eventsByGenre)) {
        console.log(`Deduplicating ${genreEvents.length} events in genre: ${genre}`);

        genreEvents.sort((a, b) => {
            const orgA = a.organizer?.name || "";
            const orgB = b.organizer?.name || "";
            return orgA.localeCompare(orgB);
        });

        const minimalEvents = genreEvents.map(e => ({
            id: e.originalId,
            name: e.name,
            organizer: e.organizer?.name || "",
            startDate: e.startDate
        }));

        for (let i = 0; i < minimalEvents.length; i += 50) {
            const chunk = minimalEvents.slice(i, i + 50);

            if (chunk.length === 1) {
                deduplicatedResults.push(events[chunk[0].id]);
                continue;
            }

            try {
                const uniqueItems = await groqDeduplicate(chunk);
                const eventsArray = uniqueItems.events || [];
                for (const item of eventsArray) {
                    if (item.id !== undefined && events[item.id]) {
                        deduplicatedResults.push(events[item.id]);
                    }
                }

                console.log(`Removed ${chunk.length - eventsArray.length} events from genre: ${genre}`);

            } catch (e) {
                console.error(`Error deduplicating chunk for ${genre}:`, e);
                chunk.forEach(item => deduplicatedResults.push(events[item.id]));
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    return deduplicatedResults;
}

async function main() {
    const inputFilePath = path.join(process.cwd(), 'output', 'categorizedEvents.json');
    const rawEvents: EventData[] = JSON.parse(fs.readFileSync(inputFilePath, 'utf-8'));
    console.log(`Starting deduplication of ${rawEvents.length} events...`);

    const deduplicatedEvents = await deduplicateEvents(rawEvents);

    const outputPath = path.join(process.cwd(), 'output', 'deduplicatedEvents.json');
    fs.writeFileSync(outputPath, JSON.stringify(deduplicatedEvents, null, 2));
    console.log(`Finished! Saved ${deduplicatedEvents.length} deduplicated events to ${outputPath} (started with ${rawEvents.length}).`);
}

main();