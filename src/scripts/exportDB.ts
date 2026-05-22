import 'dotenv/config';
import { MongoClient } from 'mongodb';

export async function exportDB(events: any[]) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("Skipping MongoDB export: MONGODB_URI environment variable is missing.");
        return;
    }

    console.log("Connecting to MongoDB cluster...");
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();
        const collection = db.collection('events');

        console.log("Deleting events with 0 likes...");
        const deleteResult = await collection.deleteMany({ numLikes: 0 });
        console.log(`Deleted ${deleteResult.deletedCount} events with 0 likes.`);

        console.log(`Writing ${events.length} fresh events to MongoDB...`);
        await collection.insertMany(events);
        console.log(`Successfully synced all events to MongoDB!`);
    } catch (err) {
        console.error("MongoDB export failed:", err);
    } finally {
        await client.close();
    }
}
