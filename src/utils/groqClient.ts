export async function callGroq(systemPrompt: string, userPrompt: string) {
    const response = await fetch(`http://localhost:11434/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'llama3.1',
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
        console.error("Local API Error:", JSON.stringify(data, null, 2));
        throw new Error("Invalid response from local Ollama API");
    }

    const content = data.choices[0].message.content;
    const cleanContent = content.replace(/^```json/gi, '').replace(/```$/g, '').trim();

    return JSON.parse(cleanContent);
}
