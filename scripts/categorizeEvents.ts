import fs from 'fs';
import path from 'path';
import 'dotenv/config';

interface EventData {
  name: string;
  startDate: string;
  endDate?: string;
  organizer: { name: string };
  url?: string;
  genres?: string[];
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.3-70b-versatile';

if (!GROQ_API_KEY) {
  console.error("Please add GROQ_API_KEY to your .env file.");
  process.exit(1);
}

async function groqCategorize(events: { id: number; name: string; organizer: string }[]) {
  const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `
            You are an expert at categorizing events. Return a JSON object containing an "events" array of the same length as the input array. Each object in the "events" array should have the same id as the input object, and a genres string with 1 genre.
            List of genres (you must only use these): Music, Dance, Theater, Comedy, Creative Arts, Tech, Environment, Games, Community, Social, Youth, Food & Drink, Literary. 
            Example output:
            {"events": [{"id": 1, "genres": "Comedy"}, {"id": 2, "genres": "Literary"}]}
          `
        },
        {
          role: 'user',
          content: `Categorize these events following the example output as a JSON object using the genres given only: ${JSON.stringify(events)}`
        }
      ],
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  if (!data.choices || !data.choices[0]) {
    console.error("Groq API Error:", JSON.stringify(data, null, 2));
    throw new Error("Invalid response from Groq API");
  }

  const content = data.choices[0].message.content;
  const cleanContent = content.replace(/^```json/gi, '').replace(/```$/g, '').trim();

  return JSON.parse(cleanContent).events;
}

async function categorizeEvents(events: EventData[]) {
  const numEvents = 50;

  const minimalEvents = events.map((e, idx) => ({
    id: idx,
    name: e.name,
    organizer: e.organizer?.name
  }));

  console.log(`${minimalEvents.length} events being categorized!`);

  const categorizedEvents: EventData[] = [];

  for (let i = 0; i < minimalEvents.length; i += numEvents) {
    console.log(`Processing chunk ${i} to ${i + numEvents}`);
    const chunk = i >= minimalEvents.length ? minimalEvents.slice(i) : minimalEvents.slice(i, i + numEvents);
    const categorizedChunk = await groqCategorize(chunk);
    const eventsWithGenres = categorizedChunk.map((catItem: any) => {
      const originalEvent = events[catItem.id];
      return {
        ...originalEvent,
        genres: [catItem.genres || "Miscellaneous"]
      };
    });

    categorizedEvents.push(...eventsWithGenres);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  return categorizedEvents;
}

async function main() {
  const rawEvents: EventData[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'output', 'events.json'), 'utf-8'));
  console.log(`Starting categorization of ${rawEvents.length} events...`);
  const categorizedEvents = await categorizeEvents(rawEvents);

  const outputPath = path.join(process.cwd(), 'output', 'categorizedEvents.json');
  fs.writeFileSync(outputPath, JSON.stringify(categorizedEvents, null, 2));
  console.log(`Saved ${categorizedEvents.length} categorized events to ${outputPath}`);
}

main();
