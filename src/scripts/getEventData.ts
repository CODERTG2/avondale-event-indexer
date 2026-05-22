import fs from 'fs';
import { indexEvents } from "../indexEvents.ts";
import type { Organization } from '../definitions.ts';

const organizations: Organization[] = JSON.parse(fs.readFileSync('organizations.json', 'utf-8'));
let events = await indexEvents(organizations);