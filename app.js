let extractedData = {};

async function processDocument() {
  // Read key from window.GEMINI_API_KEY or fall back to window prompt
  const apiKey = (typeof window.GEMINI_API_KEY !== 'undefined' && window.GEMINI_API_KEY)
    ? window.GEMINI_API_KEY
    : prompt("Enter your Gemini API Key (starts with AIzaSy):");

  const fileInput = document.getElementById('fileInput').files[0];

  if (!apiKey || (!apiKey.startsWith('AIzaSy') && !apiKey.startsWith('AQ.'))) {
    return alert("Invalid Gemini API Key format.");
  }
  if (!fileInput) {
    return alert("Please upload the inspection PDF or image.");
  }

  const processBtn = document.getElementById('processBtn');
  processBtn.innerText = "Analyzing Document with AI...";
  processBtn.disabled = true;

  try {
    const base64Data = await convertFileToBase64(fileInput);
    const mimeType = fileInput.type || 'application/pdf';

    const promptText = `
      Extract the following electricity theft inspection details from this document into a valid JSON object:
      {
        "consumer_name": "Name of primary owner/consumer",
        "user_name": "Name of user/accused present",
        "user_age": "Age",
        "mobile": "Mobile number",
        "village": "Village name",
        "panchanama_no": "Panchanama number",
        "inspection_date": "Inspection Date (DD-MM-YYYY)",
        "inspection_time": "Inspection Time",
        "officer_name": "Inspection Officer Name",
        "distribution_center": "Distribution center / Vitran Kendra",
        "sanctioned_load": "Connected Load e.g. 2530 WATT",
        "assessment_amount": "Assessment Amount in INR",
        "compounding_amount": "Compounding Amount in INR",
        "total_amount": "Total Amount in INR",
        "notice_no": "Section 152 notice number",
        "notice_date": "Notice Date"
      }
      Respond ONLY with the raw JSON string. Do not include markdown code blocks.
    `;

    // FIX: Using v1beta endpoint instead of v1
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }]
      })
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(`API Error (${result.error.code}): ${result.error.message}`);
    }

    if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
      throw new Error("No response returned from the model. Check image clarity or safety blocks.");
    }

    const rawText = result.candidates[0].content.parts[0].text;

    // Clean raw JSON formatting if wrapped in codeblocks
    const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    extractedData = JSON.parse(cleanJson);
    populateFormGrid(extractedData);
    document.getElementById('reviewSection').classList.remove('hidden');

  } catch (error) {
    alert("Extraction Failed: " + error.message);
    console.error(error);
  } finally {
    processBtn.innerText = "Extract Data & Generate Drafts";
    processBtn.disabled = false;
  }
}

function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

function populateFormGrid(data) {
  const container = document.getElementById('formGrid');
  container.innerHTML = '';

  for (const [key, value] of Object.entries(data)) {
    container.innerHTML += `
      <div>
        <label class="block font-semibold capitalize text-xs text-gray-600">${key.replace(/_/g, ' ')}:</label>
        <input type="text" data-key="${key}" value="${value || ''}" class="w-full p-1 border rounded text-sm edit-field" oninput="updateData()">
      </div>
    `;
  }
  updateData();
}

function updateData() {
  document.querySelectorAll('.edit-field').forEach(input => {
    const key = input.getAttribute('data-key');
    extractedData[key] = input.value;
  });

  for (const [key, value] of Object.entries(extractedData)) {
    document.querySelectorAll(`.field-${key}`).forEach(el => {
      el.innerText = value || 'N/A';
    });
  }
}

function generatePrintView() {
  document.getElementById('documentOutput').classList.remove('hidden');
  window.print();
}