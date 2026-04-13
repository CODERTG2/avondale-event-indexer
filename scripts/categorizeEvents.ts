import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { callGroq } from '../src/utils/groqClient.ts';

export interface EventData {
  name: string;
  startDate: string;
  endDate?: string;
  organizer: { name: string };
  url?: string;
  genre?: string;
  // ageGroup?: string;
}

async function groqCategorizeGenre(event: { name: string; organizer: string }) {
  const systemPrompt = `
            You are an expert at categorizing events. Return a JSON object with a "genre" key.
            List of genres (you must only use these): Music, Dance, Theater, Comedy, Creative Arts, Tech, Environment, Games, Community, Social, Food & Drink, Literary.
            Example output:
            {"genre": "Comedy"}
          `;
  const userPrompt = `Categorize this event following the example output as a JSON object using the genres and age groups given only: ${JSON.stringify(event)}`;
  return callGroq(systemPrompt, userPrompt);
}

// async function groqCategorizeAge(event: { name: string; organizer: string }) {
//   const systemPrompt = `
//             You are an expert at categorizing events. Return a JSON object with an "ageGroup" key.
//             List of age groups (you must only use these): All Ages, Youth, Adult, Elderly.
//             Example output:
//             {"ageGroup": "All Ages"}
//           `;
//   const userPrompt = `Categorize this event following the example output as a JSON object using the genres and age groups given only: ${JSON.stringify(event)}`;
//   return callGroq(systemPrompt, userPrompt);
// }

export async function categorizeEvents(events: EventData[]) {
  const minimalEvents = events.map((e, idx) => ({
    id: idx,
    name: e.name,
    organizer: e.organizer?.name
  }));

  console.log(`${minimalEvents.length} events being categorized!`);

  const categorizedEvents: EventData[] = [];

  for (let i = 0; i < minimalEvents.length; i++) {
    const percent = Math.round(((i + 1) / minimalEvents.length) * 100);
    const bar = '█'.repeat(Math.round(percent / 5)).padEnd(20, '░');
    process.stdout.write(`\r[${bar}] ${percent}% | ${i + 1}/${minimalEvents.length}`);

    try {
      const genreResult = await groqCategorizeGenre({ name: minimalEvents[i].name, organizer: minimalEvents[i].organizer });
      // const ageResult = await groqCategorizeAge({ name: minimalEvents[i].name, organizer: minimalEvents[i].organizer });
      const originalEvent = events[minimalEvents[i].id];

      categorizedEvents.push({
        ...originalEvent,
        genre: genreResult.genre
        // ageGroup: ageResult.ageGroup
      });
    } catch (e) {
      console.error(`Error categorizing event ${i}:`, e);
      categorizedEvents.push({
        ...events[minimalEvents[i].id],
        genre: "Miscellaneous"
        // ageGroup: "All Ages"
      });
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(); // Complete the progress bar line
  return categorizedEvents;
}
