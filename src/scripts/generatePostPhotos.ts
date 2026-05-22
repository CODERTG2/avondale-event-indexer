import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const folderPath = './output/posts';

// Load logo as base64 for embedding in HTML
const logoPath = path.resolve('./assets/logo.png');
const logoBase64 = fs.readFileSync(logoPath).toString('base64');
const logoDataUri = `data:image/png;base64,${logoBase64}`;

// Check if the folder exists
if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`Directory ${folderPath} created.`);
} else {
    fs.readdirSync(folderPath).forEach(file => {
        const filePath = path.join(folderPath, file);
        if (fs.lstatSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
        }
    });
    console.log(`Deleted old files in ${folderPath}`);
}

// Read events.json
const events = JSON.parse(fs.readFileSync('./output/events.json', 'utf-8'));

function dayHeadingToSlug(headingText: string): string {
    const cleaned = headingText.replace(/<[^>]+>/g, '').trim();
    const match = cleaned.match(/^(\w+),\s*(\d+)\/(\d+)$/);
    if (match) {
        const [, dayName, month, day] = match;
        return `${dayName.toLowerCase()}_${month}_${day}`;
    }
    return cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function getGenreColor(genre: string) {
    const g = genre.toLowerCase();
    if (g.includes('music')) return '#d980fa'; // Purple
    if (g.includes('game')) return '#54a0ff'; // Blue
    if (g.includes('community')) return '#48dbfb'; // Teal
    if (g.includes('art')) return '#ff6b6b'; // Pink/Red
    if (g.includes('environment')) return '#1dd1a1'; // Green
    if (g.includes('food') || g.includes('drink')) return '#ff9f43'; // Orange
    if (g.includes('tech')) return '#00d2d3'; // Cyan
    if (g.includes('dance')) return '#ee5253'; // Red
    if (g.includes('literary')) return '#feca57'; // Yellow
    if (g.includes('theater') || g.includes('comedy')) return '#5f27cd'; // Violet
    if (g.includes('social')) return '#ff9ff3'; // Pink
    return '#c8d6e5'; // Gray
}

function formatTime(dateStr: string) {
    if (!dateStr || !dateStr.includes('T')) return 'All Day';
    const date = new Date(dateStr);
    let hours = date.getHours();
    let mins = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return mins > 0 ? `${hours}:${mins.toString().padStart(2, '0')}${ampm}` : `${hours}${ampm}`;
}

function formatTimeRange(startStr: string, endStr?: string) {
    if (!startStr || !startStr.includes('T')) return 'All Day';
    const start = formatTime(startStr);
    if (!endStr || !endStr.includes('T')) return start;
    const end = formatTime(endStr);
    
    // Combine if same am/pm e.g. 10pm-2pm -> 10-2pm
    if (start.replace(/[0-9:]/g, '') === end.replace(/[0-9:]/g, '')) {
        return `${start.replace(/[a-z]/g, '')}-${end}`;
    }
    return `${start}-${end}`;
}

function getDayHeading(dateStr: string) {
    const date = new Date(dateStr);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${days[date.getDay()]}, ${date.getMonth() + 1}/${date.getDate()}`;
}

// Group events by day
const groupedEvents = new Map<string, any[]>();
for (const event of events) {
    const heading = getDayHeading(event.startDate);
    if (!groupedEvents.has(heading)) {
        groupedEvents.set(heading, []);
    }
    groupedEvents.get(heading)!.push(event);
}

// Convert to sections
const daySections = Array.from(groupedEvents.entries()).map(([headingText, dayEvents]) => {
    // Sort events by start time (rough sort by raw date string works for ISO dates)
    dayEvents.sort((a, b) => a.startDate.localeCompare(b.startDate));

    const eventItems = dayEvents.map(event => {
        const time = formatTimeRange(event.startDate, event.endDate);
        const name = event.name;
        const org = event.organizer?.name || '';
        const genre = event.genre || 'Other';
        const color = getGenreColor(genre);
        
        return `
            <li>
                <div class="event-meta">
                    <strong class="time-badge">${time}</strong>
                    <span class="genre-badge" style="--genre-color: ${color}">${genre}</span>
                </div>
                <div class="event-details">
                    <span class="event-name">${name}</span>
                    ${org ? `<span class="event-org">${org}</span>` : ''}
                </div>
            </li>
        `;
    });

    return {
        heading: `<h2>${headingText}</h2>`,
        headingText,
        eventItems
    };
});


const PAGE_HEIGHT = 1350;

type LayoutMode = 'large' | 'medium' | 'compact';

function pickLayout(eventCount: number): LayoutMode {
    if (eventCount <= 6) return 'large';
    if (eventCount <= 12) return 'medium';
    return 'compact';
}

async function measureHeight(page: puppeteer.Page, html: string, layout: LayoutMode): Promise<number> {
    await page.setContent(buildPage(html, layout, false, true));
    return await page.evaluate(() => {
        const wrapper = document.querySelector('.wrapper') as HTMLElement;
        const footer = document.querySelector('.footer') as HTMLElement;
        if (!wrapper || !footer) return document.body.scrollHeight;
        return wrapper.offsetHeight + footer.offsetHeight;
    });
}

async function generateImagesFromJSON() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: PAGE_HEIGHT });

    for (const day of daySections) {
        const slug = dayHeadingToSlug(day.headingText);
        const totalEvents = day.eventItems.length;
        if (totalEvents === 0) continue;

        let layout = pickLayout(totalEvents);
        const allEventsHTML = buildEventList(day.eventItems, layout);
        const fullPageHTML = day.heading + allEventsHTML;

        let fullHeight = await measureHeight(page, fullPageHTML, layout);

        if (fullHeight > PAGE_HEIGHT && layout !== 'compact') {
            layout = 'compact';
            const compactHTML = day.heading + buildEventList(day.eventItems, layout);
            fullHeight = await measureHeight(page, compactHTML, layout);
        }

        if (fullHeight <= PAGE_HEIGHT) {
            const shouldCenter = totalEvents <= 8;
            const finalHTML = day.heading + buildEventList(day.eventItems, layout);
            await page.setContent(buildPage(finalHTML, layout, shouldCenter, false));
            await page.screenshot({ path: `${folderPath}/${slug}.png` });
            console.log(`  ✓ ${slug}.png (${totalEvents} events, ${layout}, single page)`);
        } else {
            layout = 'compact';
            const page1Count = await findFitCount(page, day.heading, day.eventItems, layout);

            const page1HTML = day.heading + buildEventList(day.eventItems.slice(0, page1Count), layout);
            await page.setContent(buildPage(page1HTML, layout, false, false));
            await page.screenshot({ path: `${folderPath}/${slug}_pt1.png` });
            console.log(`  ✓ ${slug}_pt1.png (events 1-${page1Count} of ${totalEvents})`);

            let remaining = day.eventItems.slice(page1Count);
            let partNum = 2;

            while (remaining.length > 0) {
                let partLayout = pickLayout(remaining.length);
                const continuedHeading = `${day.heading}<p class="continued">continued</p>`;

                let partHeight = await measureHeight(page, continuedHeading + buildEventList(remaining, partLayout), partLayout);
                if (partHeight > PAGE_HEIGHT && partLayout !== 'compact') {
                    partLayout = 'compact';
                    partHeight = await measureHeight(page, continuedHeading + buildEventList(remaining, partLayout), partLayout);
                }

                let fitCount: number;
                if (partHeight <= PAGE_HEIGHT) {
                    fitCount = remaining.length;
                } else {
                    fitCount = await findFitCount(page, continuedHeading, remaining, partLayout);
                }

                const fitLayout = pickLayout(fitCount);
                const shouldCenter = fitCount <= 8;
                const partHTML = continuedHeading + buildEventList(remaining.slice(0, fitCount), fitLayout);
                await page.setContent(buildPage(partHTML, fitLayout, shouldCenter, false));
                await page.screenshot({ path: `${folderPath}/${slug}_pt${partNum}.png` });
                console.log(`  ✓ ${slug}_pt${partNum}.png (${fitCount} events, ${fitLayout})`);

                remaining = remaining.slice(fitCount);
                partNum++;
            }
        }
    }

    await browser.close();
}

async function findFitCount(page: puppeteer.Page, headingHTML: string, items: string[], layout: LayoutMode): Promise<number> {
    let lo = 1, hi = items.length, best = 1;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const testHTML = headingHTML + buildEventList(items.slice(0, mid), layout);
        const h = await measureHeight(page, testHTML, layout);
        if (h <= PAGE_HEIGHT) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best;
}

function buildEventList(items: string[], layout: LayoutMode): string {
    const cls = layout === 'compact' ? 'event-grid compact' : `event-grid ${layout}`;
    return `<ul class="${cls}">${items.join('\n')}</ul>`;
}

generateImagesFromJSON()
    .then(() => {
        console.log('Event images generated successfully!');
    })
    .catch((err) => {
        console.error('Error generating event images:', err);
    });

function buildPage(htmlContent: string, layout: LayoutMode, centerContent: boolean, measuring: boolean) {
    const sizes = {
        large: {
            wrapperPad: '50px 60px 80px 60px',
            headerGap: '18px',
            headerMb: '28px',
            headerPb: '22px',
            logoSize: '44px',
            logoRadius: '12px',
            headerFont: '16px',
            h2Size: '3.5em',
            h2Pad: '0 0 18px 0',
            h2Mb: '8px',
            accentW: '90px',
            accentH: '6px',
            continuedFont: '1.2em',
            gridCols: '1fr',
            gridGap: '16px',
            gridMt: '24px',
            liPad: '22px 26px',
            liRadius: '20px',
            liGap: '12px',
            eventName: '1.5em',
            eventOrg: '1.1em',
            badgeFont: '1.0em',
            badgePad: '6px 16px',
            badgeRadius: '12px',
            footerPad: '22px 60px',
            footerLeftFont: '14px',
            footerRightFont: '13px',
            dotSize: '8px',
        },
        medium: {
            wrapperPad: '45px 50px 75px 50px',
            headerGap: '16px',
            headerMb: '24px',
            headerPb: '18px',
            logoSize: '40px',
            logoRadius: '11px',
            headerFont: '15px',
            h2Size: '3em',
            h2Pad: '0 0 16px 0',
            h2Mb: '6px',
            accentW: '80px',
            accentH: '5px',
            continuedFont: '1.1em',
            gridCols: '1fr',
            gridGap: '12px',
            gridMt: '20px',
            liPad: '18px 22px',
            liRadius: '16px',
            liGap: '8px',
            eventName: '1.25em',
            eventOrg: '0.95em',
            badgeFont: '0.85em',
            badgePad: '4px 12px',
            badgeRadius: '10px',
            footerPad: '20px 50px',
            footerLeftFont: '13px',
            footerRightFont: '12px',
            dotSize: '7px',
        },
        compact: {
            wrapperPad: '40px 40px 70px 40px',
            headerGap: '14px',
            headerMb: '20px',
            headerPb: '16px',
            logoSize: '36px',
            logoRadius: '10px',
            headerFont: '13px',
            h2Size: '2.4em',
            h2Pad: '0 0 14px 0',
            h2Mb: '4px',
            accentW: '60px',
            accentH: '4px',
            continuedFont: '0.9em',
            gridCols: '1fr 1fr',
            gridGap: '12px',
            gridMt: '16px',
            liPad: '14px 16px',
            liRadius: '14px',
            liGap: '6px',
            eventName: '1.05em',
            eventOrg: '0.85em',
            badgeFont: '0.75em',
            badgePad: '3px 10px',
            badgeRadius: '8px',
            footerPad: '18px 40px',
            footerLeftFont: '12px',
            footerRightFont: '11px',
            dotSize: '6px',
        }
    };

    const s = sizes[layout];

    return `
            <html>
                <head>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap');

                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }

                    body {
                        padding: 0;
                        font-family: 'Inter', sans-serif;
                        line-height: 1.5;
                        background-color: #0b0914;
                        /* Vibrant Premium Mesh Gradient */
                        background-image: 
                            radial-gradient(circle at 15% 50%, rgba(181, 123, 237, 0.15), transparent 40%),
                            radial-gradient(circle at 85% 30%, rgba(78, 205, 196, 0.15), transparent 40%),
                            radial-gradient(circle at 50% 80%, rgba(255, 107, 107, 0.12), transparent 50%);
                        color: #e8e6f0;
                        ${measuring ? '' : 'min-height: 1350px;'}
                        position: relative;
                        overflow: hidden;
                    }

                    .wrapper {
                        position: relative;
                        z-index: 1;
                        padding: ${s.wrapperPad};
                        ${centerContent ? `
                        min-height: calc(1350px - 55px);
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        ` : ''}
                    }

                    .header {
                        display: flex;
                        align-items: center;
                        gap: ${s.headerGap};
                        margin-bottom: ${s.headerMb};
                        padding-bottom: ${s.headerPb};
                        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                        ${centerContent ? 'flex-shrink: 0;' : ''}
                    }

                    .header-icon {
                        width: ${s.logoSize};
                        height: ${s.logoSize};
                        flex-shrink: 0;
                    }

                    .header-icon img {
                        width: 100%;
                        height: 100%;
                        object-fit: contain;
                        filter: invert(1);
                    }

                    .header-text {
                        font-family: 'Outfit', sans-serif;
                        font-size: ${s.headerFont};
                        font-weight: 600;
                        letter-spacing: 3px;
                        text-transform: uppercase;
                        color: rgba(255, 255, 255, 0.7);
                    }

                    h2 {
                        font-family: 'Outfit', sans-serif;
                        font-size: ${s.h2Size};
                        font-weight: 800;
                        padding: ${s.h2Pad};
                        margin-bottom: ${s.h2Mb};
                        border-bottom: none;
                        color: #ffffff;
                        position: relative;
                        letter-spacing: -1px;
                        text-shadow: 0 4px 20px rgba(0,0,0,0.5);
                    }

                    h2::after {
                        content: '';
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        width: ${s.accentW};
                        height: ${s.accentH};
                        background: linear-gradient(90deg, #ff6b6b, #ee5a24);
                        border-radius: 4px;
                        box-shadow: 0 0 12px rgba(255, 107, 107, 0.4);
                    }

                    p.continued {
                        font-family: 'Outfit', sans-serif;
                        font-size: ${s.continuedFont};
                        font-weight: 500;
                        letter-spacing: 2px;
                        text-transform: uppercase;
                        color: rgba(255, 107, 107, 0.8);
                        margin-top: 8px;
                        margin-bottom: 0;
                    }

                    ul.event-grid {
                        display: grid;
                        grid-template-columns: ${s.gridCols};
                        gap: ${s.gridGap};
                        list-style-type: none;
                        padding-left: 0;
                        margin-top: ${s.gridMt};
                    }

                    /* Glassmorphism Event Cards */
                    li {
                        background: rgba(255, 255, 255, 0.04);
                        backdrop-filter: blur(16px);
                        -webkit-backdrop-filter: blur(16px);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-top: 1px solid rgba(255, 255, 255, 0.15);
                        border-left: 1px solid rgba(255, 255, 255, 0.15);
                        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
                        border-radius: ${s.liRadius};
                        padding: ${s.liPad};
                        display: flex;
                        flex-direction: column;
                        gap: ${s.liGap};
                    }

                    .event-meta {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        flex-wrap: wrap;
                    }

                    .time-badge {
                        display: inline-block;
                        padding: ${s.badgePad};
                        text-align: center;
                        font-family: 'Outfit', sans-serif;
                        font-size: ${s.badgeFont};
                        font-weight: 700;
                        color: #ffffff;
                        background: rgba(255, 255, 255, 0.12);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        border-radius: ${s.badgeRadius};
                        line-height: 1.4;
                        letter-spacing: 0.5px;
                    }

                    .genre-badge {
                        display: inline-block;
                        padding: ${s.badgePad};
                        text-align: center;
                        font-family: 'Outfit', sans-serif;
                        font-size: ${s.badgeFont};
                        font-weight: 700;
                        line-height: 1.4;
                        letter-spacing: 0.5px;
                        border-radius: ${s.badgeRadius};
                        /* CSS Custom Properties injected inline */
                        color: var(--genre-color);
                        background: color-mix(in srgb, var(--genre-color) 15%, transparent);
                        border: 1px solid color-mix(in srgb, var(--genre-color) 30%, transparent);
                    }

                    .event-details {
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                        margin-top: 2px;
                    }

                    .event-name {
                        color: rgba(255, 255, 255, 0.95);
                        font-size: ${s.eventName};
                        font-weight: 600;
                        line-height: 1.3;
                        text-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    }

                    .event-org {
                        color: rgba(255, 255, 255, 0.5);
                        font-size: ${s.eventOrg};
                        font-weight: 400;
                        line-height: 1.4;
                    }

                    .footer {
                        position: ${measuring ? 'relative' : 'absolute'};
                        bottom: 0;
                        left: 0;
                        right: 0;
                        padding: ${s.footerPad};
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        border-top: 1px solid rgba(255, 255, 255, 0.06);
                        background: rgba(0, 0, 0, 0.3);
                        backdrop-filter: blur(10px);
                    }

                    .footer-left {
                        font-family: 'Outfit', sans-serif;
                        font-size: ${s.footerLeftFont};
                        font-weight: 600;
                        letter-spacing: 2px;
                        text-transform: uppercase;
                        color: rgba(255, 255, 255, 0.4);
                    }

                    .footer-right {
                        font-size: ${s.footerRightFont};
                        color: rgba(255, 255, 255, 0.3);
                        font-weight: 400;
                    }

                    .footer-dot {
                        display: inline-block;
                        width: ${s.dotSize};
                        height: ${s.dotSize};
                        background: #ff6b6b;
                        border-radius: 50%;
                        margin-right: 10px;
                        vertical-align: middle;
                        box-shadow: 0 0 8px rgba(255, 107, 107, 0.6);
                    }
                </style>
                </head>
                <body>
                    <div class="wrapper">
                        <div class="header">
                            <div class="header-icon"><img src="${logoDataUri}" alt="Avondale" /></div>
                            <div class="header-text">Avondale Events</div>
                        </div>
                        ${htmlContent}
                    </div>
                    <div class="footer">
                        <div class="footer-left"><span class="footer-dot"></span>avondale.events</div>
                        <div class="footer-right">Chicago, IL</div>
                    </div>
                </body>
            </html>
            `;

}
