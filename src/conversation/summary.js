// Daily clinical & family summary report generator

export async function generateDailySummary({ dailyLog = [], memory = {} }) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  const model = import.meta.env.VITE_GROQ_MODEL || 'openai/gpt-oss-20b';

  // Rule-based fallback summary
  const painLogs = dailyLog.filter((l) => l.category === 'pain' || (l.reply || '').toLowerCase().includes('pain') || (l.reply || '').toLowerCase().includes('headache') || (l.reply || '').toLowerCase().includes('ache'));
  const requestLogs = dailyLog.filter((l) => l.kind === 'request' || l.category === 'needs');
  const totalTurns = dailyLog.length;

  const fallbackReport = `Daily Clinical & Family Summary
Patient: ${memory.name || 'Aarav Sharma'}
Date: ${new Date().toLocaleDateString()}
Total Interactions Today: ${totalTurns}

1. 🩺 Pain & Physical Comfort
${painLogs.length > 0 ? painLogs.map((p) => {
  if (p.zone && p.score) {
    return `• [${p.timeStr}] ${p.zone} ${p.score}/10 at ${p.timeStr} (${p.level || 'acute'}) - "${p.reply}"`;
  }
  return `• [${p.timeStr}] Reported: "${p.reply}"`;
}).join('\n') : '• No acute pain reported today. Patient appeared relatively comfortable.'}

2. 😊 Mood & Communication Engagement
• Active interaction throughout the day using eye-gaze communication.
• Responses indicate calm and cooperative engagement with caregivers.

3. 🏠 Care Needs & Requests
${requestLogs.length > 0 ? requestLogs.map((r) => `• [${r.timeStr}] Request: "${r.reply}"`).join('\n') : '• Routine care provided. Regular water and repositioning requests fulfilled.'}

4. 📋 Caregiver Action Items
• Scheduled Meds: ${memory.meds || 'As per doctor schedule'}
• Ensure hydration and monitor comfort levels during rest periods.`;

  if (!apiKey || dailyLog.length === 0) {
    return fallbackReport;
  }

  const logSnippet = dailyLog.slice(-30).map((l) => `[${l.timeStr}] Heard: "${l.heard || '-'}" -> Spoken: "${l.reply || '-'}" (Type: ${l.kind || 'chat'}${l.zone ? `, Zone: ${l.zone}, Score: ${l.score}/10` : ''})`).join('\n');

  const prompt = `You are an AAC clinical assistant creating a structured daily report for the doctor and family.
Patient: ${memory.name} (${memory.condition})
Medications: ${memory.meds}
Today's Event Log:
${logSnippet}

Provide a structured, compassionate, and factual medical summary covering:
1. 🩺 Pain & Physical Comfort (clearly list all pain events with zone, score, and exact time, e.g. "stomach 8/10 at 1:40 pm")
2. 😊 Mood, Cognition & Responsiveness
3. 🏠 Care Needs & Smart Requests Fulfilled
4. 📋 Care Team Recommendations`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        reasoning_effort: 'low',
        max_completion_tokens: 450
      })
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) return content;
    }
  } catch (err) {
    console.warn('AI summary failed, using structured fallback:', err);
  }

  return fallbackReport;
}
