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
        "consumer_name": "Name of primary owner/consumer (e.g. अनवर ख़ॉन)",
        "consumer_father_name": "Father's name of primary owner/consumer (e.g. शकुर खान)",
        "user_name": "Name of user/accused present (e.g. सलीम ख़ॉ)",
        "user_father_name": "Father's name of user/accused present (e.g. अनवर ख़ॉ)",
        "user_age": "Age of user/accused present (e.g. 25)",
        "mobile": "Mobile number (e.g. 9977997186)",
        "village": "Village name (e.g. जहाँगीरपुर)",
        "panchanama_no": "Panchanama number (e.g. 171780)",
        "inspection_date": "Inspection Date in DD-MM-YYYY format (e.g. 26-02-2024)",
        "inspection_time": "Inspection Time (e.g. 03:05 PM)",
        "officer_name": "Inspection Officer Name (e.g. महेश कुमार वर्मा)",
        "officer_father_name": "Father's name of Inspection Officer (e.g. मनोहर लाल वर्मा)",
        "officer_age": "Age of Inspection Officer (e.g. 39)",
        "distribution_center": "Distribution center / Vitran Kendra (e.g. जहाँगीरपुर)",
        "sanctioned_load": "Connected Load / load utilized (e.g. 2530 वाट)",
        "connected_load_details": "Detailed connected load items list (e.g. कूलर-1 क्षमता 700 वाट, पंखा-2 क्षमता 120 वाट, इमर्शन हीटर-1 क्षमता 1000 वाट, LED बल्ब-5 क्षमता 50 वाट, TV/LCD-1 क्षमता 160 वाट, वाशिंग मशीन-1 क्षमता 500 वाट)",
        "assessment_amount": "Assessment Amount / Net assessment amount in INR (e.g. 20,102)",
        "compounding_amount": "Compounding Amount in INR (e.g. 1,000)",
        "total_amount": "Total Amount in INR (e.g. 21,102)",
        "total_consumption_units": "Total consumption units calculated (e.g. 1032)",
        "notice_no": "Section 152 notice number (e.g. 1/कायंब/सामा./पी-4/678)",
        "notice_date": "Notice Date in DD-MM-YYYY format (e.g. 26-05-2026)",
        "speed_post_no": "Speed post tracking receipt number (e.g. E1195463998IN)",
        "witness_list": "List of witnesses present (e.g. 1. परिवादी स्वयं (महेश कुमार वर्मा), 2. श्री मोहन सिंह, 3. श्री सुरेश सिंगाठिया)"
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

    const defaultData = {
      consumer_name: "",
      consumer_father_name: "",
      user_name: "",
      user_father_name: "",
      user_age: "",
      mobile: "",
      village: "",
      panchanama_no: "",
      inspection_date: "",
      inspection_time: "",
      officer_name: "",
      officer_father_name: "",
      officer_age: "",
      officer_email: "",
      officer_mobile: "",
      distribution_center: "",
      sanctioned_load: "",
      connected_load_details: "",
      assessment_amount: "",
      compounding_amount: "",
      total_amount: "",
      total_consumption_units: "",
      notice_no: "",
      notice_date: "",
      speed_post_no: "",
      witness_list: ""
    };
    extractedData = Object.assign({}, defaultData, JSON.parse(cleanJson));
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

function printFrontCover() {
  document.body.classList.add('print-front-cover-only');
  document.body.classList.remove('print-case-documents-only');
  document.getElementById('documentOutput').classList.remove('hidden');
  window.print();
}

function printCaseDocuments() {
  document.body.classList.add('print-case-documents-only');
  document.body.classList.remove('print-front-cover-only');
  document.getElementById('documentOutput').classList.remove('hidden');
  window.print();
}