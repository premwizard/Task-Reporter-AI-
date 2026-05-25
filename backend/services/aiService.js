// Initialize Groq API Key
const getApiKey = () => {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
        console.warn('[AI Service] GROQ_API_KEY is not defined. AI Summaries will not work properly until set.');
    }
    return key;
};

/**
 * Generate a professional summary from a list of raw activities using Groq.
 * @param {Array} activities - List of activity objects
 * @param {string} employeeName - Name of the employee
 * @param {string} reportType - e.g., 'daily', 'weekly', 'project'
 */
export const generateAISummary = async (activities, employeeName, reportType = 'daily') => {
    try {
        if (!activities || activities.length === 0) {
            return 'No activities to summarize.';
        }

        const apiKey = getApiKey();
        if (!apiKey) {
            return `[MOCK AI SUMMARY] ${employeeName || 'Team'} completed ${activities.length} tasks. (Please set GROQ_API_KEY in .env to enable real AI summaries).`;
        }

        // Combine raw activities into a clean list for the prompt
        const rawActivitiesText = activities.map((a, i) => {
            const repo = a.repository_name ? ` (Repo: ${a.repository_name})` : '';
            return `${i + 1}. [${a.source}] ${a.activity}${repo}`;
        }).join('\n');

        const targetName = employeeName ? `an employee named ${employeeName}` : 'the engineering team';
        const systemPrompt = `You are a technical engineering manager writing a professional summary of work completed by ${targetName}.
You are generating a ${reportType} summary.

INSTRUCTIONS:
1. Write a single, concise paragraph summarizing this work.
2. Group similar tasks (e.g., if there are multiple commits about auth, say "Worked on authentication improvements").
3. Make it readable for non-technical stakeholders while preserving the core engineering value.
4. Do NOT repeat the raw commit messages verbatim.
5. Do NOT use bullet points.
6. The tone must be professional, direct, and manager-friendly.
7. Start directly with the summary text (e.g., "Worked on..."). Do not say "Here is the summary:" or similar pleasantries.`;

        const userPrompt = `Raw Activity Log:\n${rawActivitiesText}`;

        console.log(`[AI Service] Generating ${reportType} summary for ${employeeName || 'Team'} using Groq...`);
        
        // Use generic OpenAI chat completion format that Groq accepts natively
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile', 
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 1024,
                temperature: 0.5
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Groq API Error (${response.status}): ${errData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const text = data.choices[0].message.content;
        
        console.log('[AI Service] AI Summary generation successful via Groq.');
        return text.trim();
    } catch (error) {
        console.error('[AI Service] Error generating summary:', error);
        
        const msg = error.message || '';
        if (msg.includes('Invalid API Key') || msg.includes('401')) {
            throw new Error('Invalid Groq API Key. Please check your .env file.');
        }
        
        throw new Error(`AI Provider Error: ${msg || 'Failed to generate summary'}`);
    }
};

/**
 * Generate a professional explanation for a single raw activity/commit.
 * @param {string} activity - The raw commit message or task
 * @param {string} employeeName - Name of the employee
 * @param {string} repositoryName - Name of the repository
 */
export const generateSingleActivitySummary = async (activity, employeeName, repositoryName) => {
    try {
        if (!activity) {
            return 'No activity provided to summarize.';
        }

        const apiKey = getApiKey();
        if (!apiKey) {
            return `[MOCK AI SUMMARY] Improved functionality related to: ${activity}`;
        }

        const systemPrompt = `You are a technical engineering manager translating a single raw developer commit message into a clean, professional, non-technical explanation.

INSTRUCTIONS:
1. Write a single, concise sentence explaining the work.
2. Make it sound professional, manager-friendly, and polished.
3. Do NOT repeat the exact raw commit verbatim. Extract the intent.
4. Start directly with the explanation (e.g., "Improved...", "Fixed...", "Developed..."). Do not say "Here is the summary" or "The developer...".
5. Keep it under 20 words.`;

        const userPrompt = `Employee: ${employeeName}\nRepository: ${repositoryName || 'N/A'}\nRaw Commit: ${activity}`;

        console.log(`[AI Service] Generating individual explanation for activity: "${activity}"`);
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile', 
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 150,
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Groq API Error (${response.status}): ${errData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const text = data.choices[0].message.content;
        
        console.log('[AI Service] Single AI Summary generation successful.');
        return text.trim();
    } catch (error) {
        console.error('[AI Service] Error generating single summary:', error);
        
        const msg = error.message || '';
        if (msg.includes('Invalid API Key') || msg.includes('401')) {
            throw new Error('Invalid Groq API Key. Please check your .env file.');
        }
        
        throw new Error(`AI Provider Error: ${msg || 'Failed to explain activity'}`);
    }
};

/**
 * Generate a premium AI summary and risk analysis for a Pull Request.
 */
export const generatePRSummary = async (prData) => {
    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            return {
                summary: `This pull request modifies ${prData.changed_files || 1} files with additions of +${prData.additions || 0} and deletions of -${prData.deletions || 0}.`,
                risk_analysis: 'Mock Risk Analysis: Low. Normal repository code progression.',
                impacted_modules: 'Core Controller, Main Module'
            };
        }

        const systemPrompt = `You are a technical lead reviewing a developer's Pull Request.
You will generate a JSON response representing:
1. "summary": A brief, manager-friendly explanation of the PR's intent (2-3 sentences).
2. "risk_analysis": A paragraph evaluating potential side-effects, risk level (Low, Medium, High), and logic safety.
3. "impacted_modules": A comma-separated list of potential components, directories, or architectural modules affected.

Your output MUST be a valid JSON object ONLY. Do NOT output any other text or code blocks.
Format:
{
  "summary": "...",
  "risk_analysis": "...",
  "impacted_modules": "..."
}`;

        const userPrompt = `Pull Request Details:
Title: ${prData.title}
Description: ${prData.description || 'No description provided.'}
Repository: ${prData.repository_name}
Branch: ${prData.branch}
Stats: ${prData.changed_files} files changed, +${prData.additions} additions, -${prData.deletions} deletions.`;

        console.log(`[AI Service] Generating PR summary and risk profile for: "${prData.title}"`);

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile', 
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 1024,
                temperature: 0.4
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Groq API Error (${response.status}): ${errData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const text = data.choices[0].message.content.trim();
        
        try {
            return JSON.parse(text);
        } catch (parseErr) {
            console.warn('⚠️ [AI Service] Failed to parse PR JSON, falling back to simple object:', parseErr.message);
            return {
                summary: text,
                risk_analysis: 'Risk Rating: Low to Medium. Assumed safety.',
                impacted_modules: 'General, Backend'
            };
        }
    } catch (error) {
        console.error('[AI Service] Error generating PR summary:', error);
        throw error;
    }
};

