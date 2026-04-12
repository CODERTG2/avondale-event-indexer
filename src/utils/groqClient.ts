import 'dotenv/config';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.3-70b-versatile';

if (!GROQ_API_KEY) {
    console.error("Please add GROQ_API_KEY to your .env file.");
    process.exit(1);
}

export async function callGroq(systemPrompt: string, userPrompt: string) {
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
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: userPrompt
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

    return JSON.parse(cleanContent);
}
