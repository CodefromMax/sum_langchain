import { useState, useEffect } from "react";
import { ChatOpenAI } from "@langchain/openai";
import Papa from "papaparse";
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

interface Patient {
  ID: string;
  Age: string;
  Heart_Disease_Type: string;
  Diagnoses_Note: string;
}

interface AgeGroup {
  range: string;
  count: number;
}

function App() {
  const defaultSystemPrompt =
    "You are a clinical reasoning assistant. First, summarize the patient diagnosis in ~25 words. Then, give three reasonable guesses for the recovery time.";
  const defaultUserPromptTemplate =
    "Summarize the common patterns across these patients with";
  const defaultPopSystemPrompt = "Summarize key population trend concisely.";
  const defaultPopUserPrompt =
    "You are a medical data analyst. Summarize in around 20 words the most significant trend across the following age group distribution:";

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [populationSummary, setPopulationSummary] = useState<string>("");
  const [similarPatients, setSimilarPatients] = useState<Patient[]>([]);
  const [ageDistribution, setAgeDistribution] = useState<AgeGroup[]>([]);
  const [systemPrompt, setSystemPrompt] = useState<string>(defaultSystemPrompt);
  const [userPromptTemplate, setUserPromptTemplate] = useState<string>(
    defaultUserPromptTemplate
  );
  const [userPrompt, setUserPrompt] = useState<string>("");
  const [popSystemPrompt, setPopSystemPrompt] = useState<string>(
    defaultPopSystemPrompt
  );
  const [popUserPrompt, setPopUserPrompt] =
    useState<string>(defaultPopUserPrompt);

  useEffect(() => {
    fetch("/EHR_Data.csv")
      .then((response) => response.text())
      .then((csvData) => {
        const result = Papa.parse<Patient>(csvData, { header: true });
        setPatients(result.data);
      });
  }, []);

  useEffect(() => {
    if (!selectedPatient) return;
    const patient = patients.find((p) => p.ID === selectedPatient);
    if (!patient) return;
    const similar = patients.filter(
      (p) =>
        p.ID !== selectedPatient &&
        p.Heart_Disease_Type === patient.Heart_Disease_Type
    );
    setSimilarPatients(similar);
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
      .sort((a, b) => parseInt(a.range) - parseInt(b.range));
    setAgeDistribution(distribution);
  }, [selectedPatient, patients]);

  const generateSummary = async () => {
    const patient = patients.find((p) => p.ID === selectedPatient);
    if (!patient) return;
    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      if (!apiKey) throw new Error("OpenAI API key not found.");
      const model = new ChatOpenAI({
        openAIApiKey: apiKey,
        modelName: "gpt-3.5-turbo",
        temperature: 0.7,
      });

      const builtPrompt = `${userPromptTemplate} ${patient.Heart_Disease_Type}:
${similarPatients.map((p, i) => `${i + 1}. ${p.Diagnoses_Note}`).join("\n")}`;
      setUserPrompt(builtPrompt);
      const patientResponse = await model.invoke([
        ["system", systemPrompt],
        ["user", builtPrompt],
      ]);
      setSummary(patientResponse.content.toString());

      const statsPrompt = `${popUserPrompt}
${ageDistribution.map((g) => `${g.range}: ${g.count}`).join("\n")}`;
      const statsResponse = await model.invoke([
        ["system", popSystemPrompt],
        ["user", statsPrompt],
      ]);
      setPopulationSummary(statsResponse.content.toString());
    } catch (error) {
      console.error("Error generating summary:", error);
      setSummary("Error generating summary. Please check your API key.");
      setPopulationSummary("");
    }
  };

  const downloadSummary = () => {
    const patient = patients.find((p) => p.ID === selectedPatient);
    if (!patient || !summary) return;
    const data = {
      timestamp: new Date().toISOString(),
      selectedPatient: patient.ID,
      systemPrompt,
      userPrompt,
      summary,
      type: "PatientCase",
      populationSummary,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `summary_${patient.ID}.json`;
    a.click();
  };

  const restoreDefaultPrompts = () => {
    setSystemPrompt(defaultSystemPrompt);
    setUserPromptTemplate(defaultUserPromptTemplate);
    setPopSystemPrompt(defaultPopSystemPrompt);
    setPopUserPrompt(defaultPopUserPrompt);
  };

  return (
    <div className="App container">
      <h1 className="title">EHR Data Analysis</h1>
      <div className="form-group">
        <label>Select Patient:</label>
        <select
          className="input"
          value={selectedPatient}
          onChange={(e) => setSelectedPatient(e.target.value)}
        >
          <option value="">Select a patient...</option>
          {patients.map((p) => (
            <option key={p.ID} value={p.ID}>
              Patient {p.ID} - {p.Heart_Disease_Type}
            </option>
          ))}
        </select>
        <label>System Prompt:</label>
        <textarea
          className="input"
          rows={1}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
        <label>User Prompt Template:</label>
        <textarea
          className="input"
          rows={1}
          value={userPromptTemplate}
          onChange={(e) => setUserPromptTemplate(e.target.value)}
        />
        <label>Population Summary System Prompt:</label>
        <textarea
          className="input"
          rows={1}
          value={popSystemPrompt}
          onChange={(e) => setPopSystemPrompt(e.target.value)}
        />
        <label>Population Summary User Prompt:</label>
        <textarea
          className="input"
          rows={2}
          value={popUserPrompt}
          onChange={(e) => setPopUserPrompt(e.target.value)}
        />
        <div className="button-group">
          <button className="btn secondary" onClick={restoreDefaultPrompts}>
            Restore Default Prompts
          </button>
          <button className="btn primary" onClick={generateSummary}>
            I Confirm Prompt is Ready and Generate New Summary
          </button>
        </div>
        {selectedPatient && (
          <>
            <h2>Diagnosis Summary</h2>
            <p className="summary-box purple-box">
              {summary || "Click the button above to generate a result."}
            </p>
            <h2>Population Statistic Summary</h2>
            <p className="summary-box blue-box">
              {populationSummary || "Population summary loading..."}
            </p>
            <button className="btn download" onClick={downloadSummary}>
              Download Summary
            </button>
          </>
        )}
        {ageDistribution.length > 0 && (
          <div className="chart-container">
            <h2>Age Distribution</h2>
            <BarChart width={600} height={300} data={ageDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="range"
                label={{ value: "Age Range", position: "bottom" }}
              />
              <YAxis
                allowDecimals={false}
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
        )}
      </div>
    </div>
  );
}

export default App;
