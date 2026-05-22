interface EventData {
    name: string;
    startDate: string | Date;
    endDate?: string | Date;
    organizer: { name: string };
    url?: string;
    genre?: string;
}

function parseDay(dateStr?: string | Date): string {
    if (!dateStr) return "unknown";
    const str = dateStr instanceof Date ? dateStr.toISOString() : String(dateStr);
    return str.slice(0, 10);
}

function hasTime(dateStr?: string | Date): boolean {
    if (!dateStr) return false;
    const str = dateStr instanceof Date ? dateStr.toISOString() : String(dateStr);
    return str.length > 10;
}

function getMs(dateStr?: string | Date): number | null {
    if (!dateStr || !hasTime(dateStr)) return null;
    const t = new Date(dateStr).getTime();
    return isNaN(t) ? null : t;
}

function areOverlapping(e1: EventData, e2: EventData): boolean {
    if (!hasTime(e1.startDate) || !hasTime(e1.endDate) ||
        !hasTime(e2.startDate) || !hasTime(e2.endDate)) {
        return true;
    }

    const start1 = getMs(e1.startDate) || 0;
    const end1 = getMs(e1.endDate) || 0;

    const start2 = getMs(e2.startDate) || 0;
    const end2 = getMs(e2.endDate) || 0;

    return start1 <= end2 && start2 <= end1;
}

function scoreInfo(e: EventData): number {
    let score = 0;
    if (e.name) score += 1;
    if (e.organizer?.name) score += 1;
    if (e.startDate && hasTime(e.startDate)) score += 2;
    if (e.endDate && hasTime(e.endDate)) score += 2;
    if (e.url) score += 1;
    if (e.genre) score += 1;
    return score;
}

export async function deduplicateEvents(events: EventData[]) {
    const eventsByDate: Record<string, EventData[]> = {};
    for (const event of events) {
        const day = parseDay(event.startDate);
        if (!eventsByDate[day]) eventsByDate[day] = [];
        eventsByDate[day].push(event);
    }

    const deduplicatedResults: EventData[] = [];

    for (const [day, dayEvents] of Object.entries(eventsByDate)) {
        dayEvents.sort((a, b) => {
            const timeA = getMs(a.startDate) || -1;
            const timeB = getMs(b.startDate) || -1;
            return timeA - timeB;
        });

        const pairs: [number, number][] = [];
        for (let i = 0; i < dayEvents.length; i++) {
            for (let j = i + 1; j < dayEvents.length; j++) {
                const org1 = String(dayEvents[i].organizer?.name || "").toLowerCase().trim();
                const org2 = String(dayEvents[j].organizer?.name || "").toLowerCase().trim();

                if (org1 === org2 && areOverlapping(dayEvents[i], dayEvents[j])) {
                    pairs.push([i, j]);
                }
            }
        }

        const removedIndices = new Set<number>();

        if (pairs.length === 0) {
            deduplicatedResults.push(...dayEvents);
            continue;
        }

        for (let pIdx = 0; pIdx < pairs.length; pIdx++) {
            const [i, j] = pairs[pIdx];


            if (removedIndices.has(i) || removedIndices.has(j)) continue;

            const e1 = dayEvents[i];
            const e2 = dayEvents[j];

            const t1 = e1.name.toLowerCase().trim();
            const t2 = e2.name.toLowerCase().trim();

            if (t1 === t2) {
                let keepIndex = scoreInfo(e2) > scoreInfo(e1) ? 1 : 0;

                const kept = keepIndex === 0 ? e1 : e2;
                const removed = keepIndex === 0 ? e2 : e1;
                console.log(`[Exact Match] Kept: "${kept.name}" | Removed: "${removed.name}"`);

                if (keepIndex === 0) removedIndices.add(j);
                else removedIndices.add(i);
            }
        }

        for (let i = 0; i < dayEvents.length; i++) {
            if (!removedIndices.has(i)) {
                deduplicatedResults.push(dayEvents[i]);
            }
        }
    }

    return deduplicatedResults;
}
