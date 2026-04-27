import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { indexEvents } from "./src/indexEvents.ts";
import { printEventList, cleanupEvents, customAvondaleFilter } from "./src/printEventList.ts";
import { categorizeEvents } from "./scripts/categorizeEvents.ts";
import { deduplicateEvents } from "./scripts/deduplicateEvents.ts";
import { exportDB } from "./scripts/exportDB.ts";
import { embedEvents } from "./scripts/embedEvents.ts";

async function main() {
    const orgsFilePath = path.join(process.cwd(), 'organizations.json');
    const organizations = JSON.parse(fs.readFileSync(orgsFilePath, 'utf-8'));

    const progressJSON = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'output/progress.json'), 'utf-8'));

    let rawEvents: any;
    if (!progressJSON[0].status) {
        // --- 1. Scrape Events ---
        console.log("\n==============================================");
        console.log("STAGE 1: SCRAPING RAW EVENTS");
        console.log("==============================================");
        rawEvents = await indexEvents(organizations);

        console.log("\n==============================================");
        console.log("STAGE 1.5: CLEANING TITLE TEXTS");
        console.log("==============================================");
        rawEvents = cleanupEvents(rawEvents as any, customAvondaleFilter as any);

        const rawEventsPath = path.join(process.cwd(), 'output', 'rawEvents.json');
        fs.writeFileSync(rawEventsPath, JSON.stringify(rawEvents, null, 2));
        console.log(`Saved ${rawEvents.length} cleaned raw events to output/rawEvents.json`);
        progressJSON[0].status = true;
        fs.writeFileSync(path.join(process.cwd(), 'output/progress.json'), JSON.stringify(progressJSON, null, 2), 'utf8');
    } else { rawEvents = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'output', 'rawEvents.json'), 'utf-8')); }

    let deduplicatedEvents: any;
    if (!progressJSON[1].status) {
        // --- 2. Deduplicate Exact Matches ---
        console.log("\n==============================================");
        console.log("STAGE 2: DEDUPLICATING OVERLAPS");
        console.log("==============================================");
        deduplicatedEvents = await deduplicateEvents(rawEvents as any);

        const dedupsPath = path.join(process.cwd(), 'output', 'deduplicatedEvents.json');
        fs.writeFileSync(dedupsPath, JSON.stringify(deduplicatedEvents, null, 2));
        console.log(`Saved ${deduplicatedEvents.length} unique events to output/deduplicatedEvents.json (filtered down from ${rawEvents.length})`);
        progressJSON[1].status = true;
        fs.writeFileSync(path.join(process.cwd(), 'output/progress.json'), JSON.stringify(progressJSON, null, 2), 'utf8');
    } else { deduplicatedEvents = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'output', 'deduplicatedEvents.json'), 'utf-8')); }

    let categorizedEvents: any;
    if (!progressJSON[2].status) {
        // --- 3. Categorize Events with AI ---
        console.log("\n==============================================");
        console.log("STAGE 3: CATEGORIZING EVENTS (AI)");
        console.log("==============================================");
        categorizedEvents = await categorizeEvents(deduplicatedEvents as any);

        const eventsPath = path.join(process.cwd(), 'output', 'events.json');
        fs.writeFileSync(eventsPath, JSON.stringify(categorizedEvents, null, 2));
        progressJSON[2].status = true;
        fs.writeFileSync(path.join(process.cwd(), 'output/progress.json'), JSON.stringify(progressJSON, null, 2), 'utf8');
    } else { categorizedEvents = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'output', 'events.json'), 'utf-8')); }

    let embeddedEvents: any;
    if (!progressJSON[3].status) {
        // --- 4. Embed Events ---
        console.log("\n==============================================");
        console.log("STAGE 4: EMBEDDING EVENTS");
        console.log("==============================================");
        embeddedEvents = await embedEvents(categorizedEvents as any);
        const embeddedEventsPath = path.join(process.cwd(), 'output', 'embeddedEvents.json');
        fs.writeFileSync(embeddedEventsPath, JSON.stringify(embeddedEvents, null, 2));
        console.log(`Saved ${embeddedEvents.length} embedded events to output/embeddedEvents.json`);
        progressJSON[3].status = true;
        fs.writeFileSync(path.join(process.cwd(), 'output/progress.json'), JSON.stringify(progressJSON, null, 2), 'utf8');
    } else { embeddedEvents = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'output', 'embeddedEvents.json'), 'utf-8')); }

    if (!progressJSON[4].status) {
        // --- 5. Generate Markdown ---
        console.log("\n==============================================");
        console.log("STAGE 5: GENERATING MARKDOWN EXPORT");
        console.log("==============================================");
        const markdownEvents = embeddedEvents.map(e => ({
            ...e,
            startDate: e.startDate instanceof Date ? e.startDate.toISOString() : e.startDate,
            endDate: e.endDate instanceof Date ? e.endDate.toISOString() : e.endDate
        }));
        printEventList(markdownEvents as any);
        progressJSON[4].status = true;
        fs.writeFileSync(path.join(process.cwd(), 'output/progress.json'), JSON.stringify(progressJSON, null, 2), 'utf8');
    } else { embeddedEvents = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'output', 'embeddedEvents.json'), 'utf-8')); }

    if (!progressJSON[5].status) {
        console.log("\n==============================================");
        console.log("STAGE 6: EXPORTING TO MONGODB");
        console.log("==============================================");
        await exportDB(embeddedEvents);

        for (const progress of progressJSON) { progress.status = false; }
        fs.writeFileSync(path.join(process.cwd(), 'output/progress.json'), JSON.stringify(progressJSON, null, 2), 'utf8');
    }

    console.log("Pipeline complete! Data is ready in /output.");
}

main().catch(console.error);
