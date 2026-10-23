/**
 * npm run test:ai — runs analyzeComplaint on 5 sample complaints and prints the JSON,
 * so we can eyeball AI quality (language, category, priority, follow-up questions).
 * Dev only: calls Gemini directly with GEMINI_API_KEY from .env.local.
 */
import "./load-env";
import { analyzeComplaint, type AnalyzeInput } from "../src/lib/ai/analyze";

const empty = { building: null, floor: null, spot: null, machine_id: null };

const SAMPLES: { name: string; input: AnalyzeInput }[] = [
  {
    name: "Hindi, vague leak",
    input: { module: "hostel", text: "पानी लीक हो रहा है", location: { ...empty, building: "New Hostel", floor: "1st" } },
  },
  {
    name: "Vague fan",
    input: { module: "hostel", text: "fan not working", location: { ...empty, building: "Old Hostel" } },
  },
  {
    name: "Sparking socket (should be Urgent)",
    input: {
      module: "hostel",
      text: "The socket next to my bed sparks every time I plug in my laptop charger, there was a small burning smell",
      location: { building: "New Hostel", floor: "2nd", spot: "Room 214", machine_id: null },
    },
  },
  {
    name: "Wi-Fi",
    input: { module: "hostel", text: "wifi is very slow since yesterday, cant even open moodle", location: { ...empty, building: "Old Hostel", floor: "1st" } },
  },
  {
    name: "Mess food",
    input: { module: "hostel", text: "Found a hair in the sabzi and the roti was raw, this happens every week", location: { ...empty, building: "New Hostel Mess" } },
  },
];

async function main() {
  const onlyFirst = process.argv.includes("--followup");
  for (const s of SAMPLES) {
    console.log(`\n━━━ ${s.name} ━━━\n> ${s.input.text}`);
    const res = await analyzeComplaint(s.input);
    if (!res.ok) {
      console.log(`✖ FAILED after ${res.ms}ms: ${res.error}`);
      continue;
    }
    console.log(`✔ ${res.ms}ms (${res.model})`);
    console.log(JSON.stringify(res.data, null, 2));

    // Optional: simulate the one follow-up round for the Hindi sample.
    if (onlyFirst && s === SAMPLES[0] && res.data.follow_up_questions.length) {
      const round2 = await analyzeComplaint({
        ...s.input,
        location: res.data.location,
        followUp: { questions: res.data.follow_up_questions, answer: "वॉशरूम में नल से, बहुत ज़्यादा पानी बह रहा है" },
      });
      console.log("\n  ↳ after follow-up answer:");
      console.log(JSON.stringify(round2.ok ? round2.data : round2, null, 2));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
