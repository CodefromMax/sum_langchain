// Imports
import { useState, useEffect } from "react";
import { ChatOpenAI } from "@langchain/openai"; // LangChain's OpenAI wrapper
import Papa from "papaparse"; // CSV parser
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import "./App.css";

// Define patient type from CSV
interface Patient {
  ID: string;
  Age: string;
  Heart_Disease_Type: string;
  Diagnoses_Note: string;
}

// Age histogram bar type
interface AgeGroup {
  range: string;
  count: number;
}

function App() {
  // Global app states
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [similarPatients, setSimilarPatients] = useState<Patient[]>([]);
  const [ageDistribution, setAgeDistribution] = useState<AgeGroup[]>([]);

  // Load CSV once on mount
  useEffect(() => {
    fetch("/EHR_Data.csv")
      .then((response) => response.text())
      .then((csvData) => {
        const result = Papa.parse<Patient>(csvData, { header: true });
        setPatients(result.data);
      });
  }, []);

  // Recalculate everything when patient selection changes
  useEffect(() => {
    if (!selectedPatient) {
      setAgeDistribution([]);
      return;
    }

    const patient = patients.find((p) => p.ID === selectedPatient);
    if (!patient) return;

    // Find other patients with same disease
    const similar = patients.filter(
      (p) =>
        p.ID !== selectedPatient &&
        p.Heart_Disease_Type === patient.Heart_Disease_Type
    );
    setSimilarPatients(similar);

    // Age histogram grouped in 5-year bins
    const diseasePatients = patients.filter(
      (p) => p.Heart_Disease_Type === patient.Heart_Disease_Type
    );
    const ageGroups: { [key: string]: number } = {};

    diseasePatients.forEach((p) => {
      const age = parseInt(p.Age);
      const groupStart = Math.floor(age / 5) * 5;
      const groupKey = `${groupStart}-${groupStart + 4}`;
      ageGroups[groupKey] = (ageGroups[groupKey] || 0) + 1;
    });

    const distribution = Object.entries(ageGroups)
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => {
        const aStart = parseInt(a.range.split("-")[0]);
        const bStart = parseInt(b.range.split("-")[0]);
        return aStart - bStart;
      });

    setAgeDistribution(distribution);

    // Use LangChain to summarize patient diagnosis
    const summarizeNote = async () => {
      try {
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

        if (!apiKey) {
          throw new Error(
            "OpenAI API key not found. Please check your .env file."
          );
        }

        // LangChain LLM instance
        const model = new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: "gpt-3.5-turbo",
          temperature: 0.7,
        });

        // Build and invoke LLM prompt
        const response = await model.invoke([
          [
            "system",
            "You are a clinical reasoning assistant. First, summarize the patient diagnosis in ~25 words, you don't need to include everything, just show reasoning. Then, based on medical knowledge, give three reasonable guesses for the recovery time (in days or weeks), each with a one-sentence explanation. If multiple possibilities exist, explain the variation.",
          ],
          [
            "user",
            `Summarize the common patterns across these patients with ${patient.Heart_Disease_Type}:\n\n` +
              similarPatients
                .map((p, i) => `${i + 1}. ${p.Diagnoses_Note}`)
                .join("\n"),
          ],
        ]);

        setSummary(response.content.toString());
      } catch (error) {
        console.error("Error generating summary:", error);
        setSummary(
          "Error generating summary. Please ensure you have set up your OpenAI API key correctly in the .env file."
        );
      }
    };

    summarizeNote();
  }, [selectedPatient, patients]);

  // UI Rendering
  return (
    <div className="App">
      <h1>EHR Data Analysis</h1>

      {/* Dropdown to select a patient */}
      <div className="section">
        <h2>Select Patient</h2>
        <select
          value={selectedPatient}
          onChange={(e) => setSelectedPatient(e.target.value)}
        >
          <option value="">Select a patient...</option>
          {patients.map((patient) => (
            <option key={patient.ID} value={patient.ID}>
              Patient {patient.ID} - {patient.Heart_Disease_Type}
            </option>
          ))}
        </select>
      </div>

      {selectedPatient && (
        <>
          {/* Diagnosis summary from LLM */}
          <div className="section">
            <h2>Diagnosis Summary</h2>
            <p>{summary || "Generating summary..."}</p>

            {/* List of similar patients */}
            <details className="mt-4">
              <summary className="cursor-pointer text-lg font-medium">
                Similar Cases
              </summary>
              <div className="mt-3 space-y-2 pl-4">
                {Object.entries(
                  similarPatients.reduce((groups, patient) => {
                    const age = parseInt(patient.Age);
                    const groupStart = Math.floor(age / 5) * 5;
                    const range = `${groupStart}-${groupStart + 4}`;
                    if (!groups[range]) groups[range] = [];
                    groups[range].push(patient);
                    return groups;
                  }, {} as Record<string, Patient[]>)
                )
                  .sort(([a], [b]) => parseInt(a) - parseInt(b))
                  .map(([range, patientsInRange]) => (
                    <details key={range} className="ml-4">
                      <summary className="cursor-pointer text-base font-semibold">
                        Age Group: {range} years ({patientsInRange.length})
                      </summary>
                      <ul className="list-disc list-inside ml-6 mt-2">
                        {patientsInRange.map((p) => (
                          <li key={p.ID}>
                            Patient {p.ID} – Age {p.Age}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
              </div>
            </details>
          </div>

          {/* Recharts bar graph showing age distribution */}
          <div className="section">
            <h2>
              Age Distribution for{" "}
              {
                patients.find((p) => p.ID === selectedPatient)
                  ?.Heart_Disease_Type
              }
            </h2>
            <BarChart width={600} height={300} data={ageDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="range"
                label={{ value: "Age Range", position: "bottom" }}
              />
              <YAxis
                allowDecimals={false} // Only show integers on the y-axis
                label={{
                  value: "Number of Patients",
                  angle: -90,
                  position: "left",
                }}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#8884d8" name="Number of Patients" />
            </BarChart>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
