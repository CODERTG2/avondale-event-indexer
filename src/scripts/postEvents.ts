import axios from 'axios';
import dotenv from 'dotenv';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
const API_VERSION = 'v20.0';

export async function scheduleInstagramPost(
    imageUrls: string[],
    scheduledTime?: Date
) {
    try {
        const baseUrl = `https://graph.facebook.com/${API_VERSION}`;
        const caption = "Awesome events happening around Avondale this week. Check it out! Visit avondale-events-website.vercel.app for more info.";

        let creationId: string;

        if (imageUrls.length === 1) {
            const data: any = {
                image_url: imageUrls[0],
                caption: caption,
                access_token: ACCESS_TOKEN
            };
            if (scheduledTime) {
                data.scheduled_publish_time = Math.floor(scheduledTime.getTime() / 1000);
            }
            const containerResponse = await axios.post(`${baseUrl}/${IG_USER_ID}/media`, data);
            creationId = containerResponse.data.id;
        } else {
            // Create item containers for each image in carousel
            const childrenIds: string[] = [];
            for (const url of imageUrls) {
                const itemRes = await axios.post(`${baseUrl}/${IG_USER_ID}/media`, {
                    image_url: url,
                    is_carousel_item: true,
                    access_token: ACCESS_TOKEN
                });
                childrenIds.push(itemRes.data.id);
            }

            // Create carousel container
            const carouselData: any = {
                media_type: 'CAROUSEL',
                children: childrenIds.join(','),
                caption: caption,
                access_token: ACCESS_TOKEN
            };
            if (scheduledTime) {
                carouselData.scheduled_publish_time = Math.floor(scheduledTime.getTime() / 1000);
            }
            const containerResponse = await axios.post(`${baseUrl}/${IG_USER_ID}/media`, carouselData);
            creationId = containerResponse.data.id;
        }

        const publishResponse = await axios.post(`${baseUrl}/${IG_USER_ID}/media_publish`, {
            creation_id: creationId,
            access_token: ACCESS_TOKEN
        });

        return publishResponse.data;
    } catch (error: any) {
        console.error('Error scheduling post:', error.response?.data || error.message);
    }
}

export function servePhotos(port: number = 3000): Promise<http.Server> {
    const directoryToServe = path.join(process.cwd(), 'output/posts');

    const server = http.createServer((req, res) => {
        if (!req.url) {
            res.writeHead(400);
            res.end();
            return;
        }

        // Prevent directory traversal
        const safePath = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(directoryToServe, safePath === '/' || safePath === '\\' ? '' : safePath);

        const extname = String(path.extname(filePath)).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
        };

        const contentType = mimeTypes[extname] || 'application/octet-stream';

        fs.readFile(filePath, (error, content) => {
            if (error) {
                if (error.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found', 'utf-8');
                } else {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end(`Server Error: ${error.code}`, 'utf-8');
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    });

    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`Serving photos from ${directoryToServe} at http://localhost:${port}`);
            resolve(server);
        });
    });
}

export async function postAllPhotos(folderPath: string) {
    const server = await servePhotos(3000);
    const publicBaseUrl = process.env.NGROK_URL || "http://localhost:3000";

    if (!fs.existsSync(folderPath)) {
        console.error(`Folder ${folderPath} does not exist.`);
        server.close();
        return;
    }

    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.png'));

    // 1. Load Events to generate hashes (detect changes)
    let events = [];
    const eventsPath = path.join(process.cwd(), 'output/events.json');
    if (fs.existsSync(eventsPath)) {
        events = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
    }
    const eventsByDaySlug = new Map<string, any[]>();
    for (const event of events) {
        const date = new Date(event.startDate);
        const key = `${date.getMonth() + 1}_${date.getDate()}`;
        if (!eventsByDaySlug.has(key)) eventsByDaySlug.set(key, []);
        eventsByDaySlug.get(key)!.push({
            name: event.name,
            startDate: event.startDate,
            endDate: event.endDate,
            organizer: event.organizer?.name,
            genre: event.genre
        });
    }

    // 2. Load Scheduled Log
    let scheduledLog: Record<string, { hash: string, isPublished: boolean }> = {};
    const logPath = path.join(process.cwd(), 'output/scheduled_log.json');
    if (fs.existsSync(logPath)) {
        scheduledLog = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    }

    // Group files by day string
    const grouped = new Map<string, string[]>();
    for (const file of files) {
        const match = file.match(/^([a-z]+)_(\d+)_(\d+)(?:_pt\d+)?\.png$/i);
        if (match) {
            const [, dayName, month, day] = match;
            const key = `${month}_${day}`;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(file);
        }
    }

    const now = new Date();
    const entries = Array.from(grouped.entries());

    console.log(`\nProcessing ${entries.length} days for Instagram...`);

    for (let i = 0; i < entries.length; i++) {
        const [key, filenames] = entries[i];

        // Progress Bar
        const percent = Math.round(((i + 1) / entries.length) * 100);
        const bar = '█'.repeat(Math.round(percent / 5)).padEnd(20, '░');
        process.stdout.write(`\r[${bar}] ${percent}% | ${i + 1}/${entries.length} (${key})`);

        // Compute Hash
        const dayEvents = eventsByDaySlug.get(key) || [];
        const hash = crypto.createHash('md5').update(JSON.stringify(dayEvents)).digest('hex');

        const [monthStr, dayStr] = key.split('_');
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);

        let targetYear = now.getFullYear();
        if (month < now.getMonth() + 1) {
            targetYear++;
        }

        const eventDate = new Date(targetYear, month - 1, day);
        filenames.sort();
        const imageUrls = filenames.map(f => `${publicBaseUrl}/${f}`);

        const isToday = eventDate.getFullYear() === now.getFullYear() &&
            eventDate.getMonth() === now.getMonth() &&
            eventDate.getDate() === now.getDate();

        // Check Log
        if (scheduledLog[key]) {
            if (scheduledLog[key].hash === hash) {
                // Already processed and no changes! Skip.
                continue;
            } else {
                // Hash changed! Alert user.
                process.stdout.write('\n'); // Break progress bar line
                if (scheduledLog[key].isPublished) {
                    console.log(`\nALERT: Events for ${key} have changed! A new updated post is being published NOW. Please manually delete the old post from your Instagram profile.\n`);
                } else {
                    console.log(`\nALERT: Events for ${key} have changed! A new updated post is being scheduled. Please manually delete the old scheduled post in the Instagram app.\n`);
                }
            }
        }

        // Post / Schedule
        let publishedNow = false;
        if (isToday) {
            await scheduleInstagramPost(imageUrls);
            publishedNow = true;
        } else {
            eventDate.setHours(8, 0, 0, 0);
            const diffMins = (eventDate.getTime() - now.getTime()) / (1000 * 60);
            if (diffMins > 10 && diffMins < 75 * 24 * 60) {
                await scheduleInstagramPost(imageUrls, eventDate);
            } else {
                await scheduleInstagramPost(imageUrls);
                publishedNow = true;
            }
        }

        // Update Log
        scheduledLog[key] = {
            hash: hash,
            isPublished: publishedNow
        };
        fs.writeFileSync(logPath, JSON.stringify(scheduledLog, null, 2), 'utf-8');
    }

    console.log(); // Complete progress bar line
    server.close(() => {
        console.log("Local photo server stopped.");
    });
}