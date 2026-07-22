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
        "accused_list": [
          {
            "name": "Given/first name of accused (e.g. अनवर) WITHOUT father's name or patronymic suffix",
            "father_name": "Father's name (if available, else empty string)",
            "age": "Age in numbers (e.g. 25)",
            "role": "भवन स्वामी / उपयोगकर्ता / भवन स्वामी एवं उपयोगकर्ता",
            "address": "Full village/tehsil address (e.g. ग्राम जहाँगीरपुर, तहसील बड़नगर, जिला उज्जैन)",
            "mobile": "10-digit mobile number (e.g. 9977997186)"
          }
        ],
        "presence_details": {
          "present_person_name": "Name of person present on site during inspection",
          "relationship_to_owner": "Self / Representative / Son / Employee / etc."
        },
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

    // Using v1beta endpoint instead of v1
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
      accused_list: [],
      presence_details: {
        present_person_name: "",
        relationship_to_owner: ""
      },
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

    let parsed = JSON.parse(cleanJson);
    
    // Set default fallback values for Complainant Officer
    if (!parsed.officer_name) parsed.officer_name = 'महेश कुमार वर्मा';
    if (!parsed.officer_father_name) parsed.officer_father_name = 'मनोहर लाल वर्मा';
    if (!parsed.officer_age) parsed.officer_age = '39';

    // Post-processing to strip redundant father's name from accused names
    if (parsed.accused_list) {
      parsed.accused_list.forEach(acc => {
        if (acc.name && acc.father_name) {
          const n = acc.name.trim();
          const f = acc.father_name.trim();
          if (n.endsWith(f) && n.length > f.length) {
            acc.name = n.substring(0, n.length - f.length).trim();
            // Strip trailing connectors like "पिता" or "आत्मज"
            acc.name = acc.name.replace(/(\u092a\u093f\u0924\u093e|\u0906\u0924\u094d\u092e\u091c)$/, '').trim();
          }
        }
      });
      parsed.accused_list = deduplicateAccusedList(parsed.accused_list);
    }

    // Fallback logic for missing village field
    if (!parsed.village) {
      let foundVillage = '';
      if (parsed.accused_list && parsed.accused_list.length > 0) {
        const addr = parsed.accused_list[0].address || '';
        const match = addr.match(/(?:ग्राम|ग्राम-)\s*([^\s,।]+)/);
        if (match && match[1]) {
          foundVillage = match[1];
        } else if (addr) {
          foundVillage = addr.split(',')[0].replace(/(तहसील|जिला|थाना).*/g, '').trim();
        }
      }
      parsed.village = foundVillage || 'जहाँगीरपुर';
    }

    extractedData = Object.assign({}, defaultData, parsed);
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

function deduplicateAccusedList(list) {
  if (!list || list.length <= 1) return list;
  
  const normalize = (name) => {
    if (!name) return '';
    return name.replace(/\s+/g, '').replace(/[ािीुूेैोौंः]/g, '').trim().toLowerCase();
  };

  const merged = [];
  list.forEach(item => {
    const normName = normalize(item.name);
    const duplicate = merged.find(m => {
      const mNorm = normalize(m.name);
      return mNorm === normName || 
             (normName.length > 3 && (normName.includes(mNorm) || mNorm.includes(normName)));
    });
    
    if (duplicate) {
      if (duplicate.role !== item.role) {
        duplicate.role = 'भवन स्वामी एवं उपयोगकर्ता';
      }
      if (!duplicate.father_name) duplicate.father_name = item.father_name;
      if (!duplicate.age) duplicate.age = item.age;
      if (!duplicate.address) duplicate.address = item.address;
      if (!duplicate.mobile) duplicate.mobile = item.mobile;
    } else {
      merged.push(Object.assign({}, item));
    }
  });
  return merged;
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
    if (key === 'accused_list') {
      let accusedHtml = `
        <div class="col-span-2 border p-3 rounded bg-gray-50 my-2">
          <h3 class="font-bold text-sm text-gray-700 mb-2">Accused List:</h3>
          <div id="accusedFormList" class="space-y-3">
      `;
      value.forEach((accused, idx) => {
        accusedHtml += `
          <div class="border p-2 rounded bg-white grid grid-cols-2 gap-2" data-accused-index="${idx}">
            <div class="col-span-2 flex justify-between items-center">
              <span class="font-semibold text-xs text-blue-700">Accused #${idx + 1}</span>
            </div>
            <div>
              <label class="block text-xs text-gray-600">Name:</label>
              <input type="text" value="${accused.name || ''}" class="w-full p-1 border rounded text-xs accused-field" data-index="${idx}" data-field="name" oninput="updateData()">
            </div>
            <div>
              <label class="block text-xs text-gray-600">Father Name:</label>
              <input type="text" value="${accused.father_name || ''}" class="w-full p-1 border rounded text-xs accused-field" data-index="${idx}" data-field="father_name" oninput="updateData()">
            </div>
            <div>
              <label class="block text-xs text-gray-600">Age:</label>
              <input type="text" value="${accused.age || ''}" class="w-full p-1 border rounded text-xs accused-field" data-index="${idx}" data-field="age" oninput="updateData()">
            </div>
            <div>
              <label class="block text-xs text-gray-600">Role:</label>
              <input type="text" value="${accused.role || ''}" class="w-full p-1 border rounded text-xs accused-field" data-index="${idx}" data-field="role" oninput="updateData()">
            </div>
            <div class="col-span-2">
              <label class="block text-xs text-gray-600">Address:</label>
              <input type="text" value="${accused.address || ''}" class="w-full p-1 border rounded text-xs accused-field" data-index="${idx}" data-field="address" oninput="updateData()">
            </div>
            <div class="col-span-2">
              <label class="block text-xs text-gray-600">Mobile:</label>
              <input type="text" value="${accused.mobile || ''}" class="w-full p-1 border rounded text-xs accused-field" data-index="${idx}" data-field="mobile" oninput="updateData()">
            </div>
          </div>
        `;
      });
      accusedHtml += `</div></div>`;
      container.innerHTML += accusedHtml;
    } else if (key === 'presence_details') {
      container.innerHTML += `
        <div class="col-span-2 border p-3 rounded bg-gray-50 my-2">
          <h3 class="font-bold text-sm text-gray-700 mb-2">Presence Details:</h3>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs text-gray-600">Present Person Name:</label>
              <input type="text" value="${value.present_person_name || ''}" class="w-full p-1 border rounded text-xs presence-field" data-field="present_person_name" oninput="updateData()">
            </div>
            <div>
              <label class="block text-xs text-gray-600">Relationship to Owner:</label>
              <input type="text" value="${value.relationship_to_owner || ''}" class="w-full p-1 border rounded text-xs presence-field" data-field="relationship_to_owner" oninput="updateData()">
            </div>
          </div>
        </div>
      `;
    } else {
      container.innerHTML += `
        <div>
          <label class="block font-semibold capitalize text-xs text-gray-600">${key.replace(/_/g, ' ')}:</label>
          <input type="text" data-key="${key}" value="${value || ''}" class="w-full p-1 border rounded text-sm edit-field" oninput="updateData()">
        </div>
      `;
    }
  }
  updateData();
}

function updateData() {
  document.querySelectorAll('.edit-field').forEach(input => {
    const key = input.getAttribute('data-key');
    extractedData[key] = input.value;
  });

  document.querySelectorAll('.accused-field').forEach(input => {
    const idx = parseInt(input.getAttribute('data-index'), 10);
    const field = input.getAttribute('data-field');
    if (!extractedData.accused_list[idx]) {
      extractedData.accused_list[idx] = {};
    }
    extractedData.accused_list[idx][field] = input.value;
  });

  document.querySelectorAll('.presence-field').forEach(input => {
    const field = input.getAttribute('data-field');
    if (!extractedData.presence_details) {
      extractedData.presence_details = {};
    }
    extractedData.presence_details[field] = input.value;
  });

  const sanitize = (val) => {
    if (typeof val !== 'string') return val;
    let s = val.replace(/\$N\/A\$/g, '')
               .replace(/\$N\/A/g, '')
               .replace(/N\/A\$/g, '')
               .replace(/\$/g, '')
               .replace(/\\/g, '')
               .replace(/\bN\/A\b/g, '')
               .replace(/\bNA\b/g, '')
               .replace(/,+/g, ',')
               .trim();
    if (s.startsWith(',')) s = s.substring(1).trim();
    if (s.endsWith(',')) s = s.substring(0, s.length - 1).trim();
    return s;
  };

  if (extractedData.accused_list) {
    extractedData.accused_list.forEach(acc => {
      for (const k in acc) {
        acc[k] = sanitize(acc[k]);
      }
      // Strip redundant father name from accused name in manual edits
      if (acc.name && acc.father_name) {
        const n = acc.name.trim();
        const f = acc.father_name.trim();
        if (n.endsWith(f) && n.length > f.length) {
          acc.name = n.substring(0, n.length - f.length).trim();
          acc.name = acc.name.replace(/(\u092a\u093f\u0924\u093e|\u0906\u0924\u094d\u092e\u091c)$/, '').trim();
        }
      }
    });
  }
  if (extractedData.presence_details) {
    for (const k in extractedData.presence_details) {
      extractedData.presence_details[k] = sanitize(extractedData.presence_details[k]);
    }
  }

  for (const [key, value] of Object.entries(extractedData)) {
    if (key === 'accused_list' || key === 'presence_details') continue;
    const sanitizedVal = sanitize(value);
    document.querySelectorAll(`.field-${key}`).forEach(el => {
      el.innerText = sanitizedVal || '';
    });
  }

  renderAccusedBlocks();
}

function getLegalTerms(accusedCount) {
  if (accusedCount > 1) {
    return {
      heading: "आरोपीगण",
      titleLabel: "2. अभियुक्त / आरोपीगण का विवरण",
      accusedTerm: "आरोपीगण",
      possesiveTerm: "आरोपीगण का",
      possessivePronoun: "उनके",
      fromTerm: "आरोपीगण से"
    };
  } else {
    return {
      heading: "आरोपी",
      titleLabel: "2. अभियुक्त / आरोपी का विवरण",
      accusedTerm: "आरोपी",
      possesiveTerm: "आरोपी का",
      possessivePronoun: "उसके",
      fromTerm: "आरोपी से"
    };
  }
}

function getPresenceNarrative(presenceDetails, accusedList) {
  const pName = presenceDetails.present_person_name || '';
  const relation = presenceDetails.relationship_to_owner || '';
  
  if (!pName) {
    return 'निरीक्षण कार्यवाही संपादित की गई।';
  }
  
  const isSelf = relation.toLowerCase().includes('self') || 
                 relation.includes('स्वयं') || 
                 accusedList.some(acc => acc.name && acc.name.trim() === pName.trim());
                 
  if (isSelf) {
    return `मौके पर स्वयं आरोपी ${pName} उपस्थित मिला। आरोपी की उपस्थिति में निरीक्षण कार्यवाही संपादित की गई।`;
  } else if (relation) {
    let ownerName = '';
    const owner = accusedList.find(acc => acc.role && acc.role.includes('स्वामी'));
    if (owner) {
      ownerName = owner.name;
    } else if (accusedList.length > 0) {
      ownerName = accusedList[0].name;
    }
    return `मौके पर आरोपी ${ownerName} का ${relation} ${pName} आरोपी के प्रतिनिधि के रूप में उपस्थित मिला। आरोपी के प्रतिनिधि की उपस्थिति में निरीक्षण कार्यवाही संपादित की गई।`;
  } else {
    return `मौके पर आरोपी के प्रतिनिधि के रूप में ${pName} उपस्थित मिला। आरोपी के प्रतिनिधि की उपस्थिति में निरीक्षण कार्यवाही संपादित की गई।`;
  }
}

function renderAccusedBlocks() {
  const accusedList = extractedData.accused_list || [];
  
  // 1. Cover page
  const coverContainer = document.getElementById('accused-list-cover');
  if (coverContainer) {
    coverContainer.innerHTML = '';
    accusedList.forEach((acc, idx) => {
      const fatherStr = acc.father_name ? ` पिता श्री ${acc.father_name}` : '';
      const ageStr = acc.age ? `, उम्र लगभग ${acc.age} वर्ष` : '';
      const roleStr = acc.role ? ` (${acc.role})` : '';
      const mobileStr = acc.mobile ? `<br>मोबाईल नंबर: ${acc.mobile}` : '';
      coverContainer.innerHTML += `
        <p>
          <span class="font-bold">${idx + 1}. ${acc.name}${fatherStr}</span>${ageStr}${roleStr}<br>
          पता: ${acc.address || 'N/A'}${mobileStr}
        </p>
      `;
    });
  }

  // 2. Computer sheet
  const compContainer = document.getElementById('accused-list-computer-sheet');
  if (compContainer) {
    compContainer.innerHTML = '';
    accusedList.forEach((acc, idx) => {
      const fatherStr = acc.father_name ? ` पिता श्री ${acc.father_name}` : '';
      const ageStr = acc.age ? `, उम्र लगभग ${acc.age} वर्ष` : '';
      const roleStr = acc.role ? ` (${acc.role})` : '';
      const mobileStr = acc.mobile ? `<br>मोबाईल नंबर: ${acc.mobile}` : '';
      compContainer.innerHTML += `
        <p>
          <span class="font-bold">${idx + 1}. ${acc.name}${fatherStr}</span>${ageStr}${roleStr}<br>
          पता: ${acc.address || 'N/A'}${mobileStr}
        </p>
      `;
    });
  }

  // 3. Vakalatnama
  const vakNamesContainer = document.getElementById('accused-names-vakalatnama');
  if (vakNamesContainer) {
    if (accusedList.length > 0) {
      if (accusedList.length === 1) {
        vakNamesContainer.innerText = `1. ${accusedList[0].name}`;
      } else {
        vakNamesContainer.innerText = `1. ${accusedList[0].name} एवं अन्य`;
      }
    } else {
      vakNamesContainer.innerText = '';
    }
  }

  // 4. Parivad Table
  const parContainer = document.getElementById('accused-list-parivad');
  if (parContainer) {
    parContainer.innerHTML = '';
    accusedList.forEach((acc, idx) => {
      const fatherStr = acc.father_name ? ` पिता श्री ${acc.father_name}` : '';
      const ageStr = acc.age ? `, उम्र लगभग ${acc.age} वर्ष` : '';
      const roleStr = acc.role ? ` (${acc.role})` : '';
      const mobileStr = acc.mobile ? `<br>मोबाईल नंबर: ${acc.mobile}` : '';
      parContainer.innerHTML += `
        <div class="${idx > 0 ? 'mt-4' : ''}">
          <span class="font-bold">${idx + 1}. ${acc.name}${fatherStr}</span>${ageStr}${roleStr}<br>
          पता - ${acc.address || 'N/A'}${mobileStr}
        </div>
      `;
    });
  }

  // 5. Presence narrative block
  const presenceContainer = document.getElementById('presence-narrative-block');
  if (presenceContainer) {
    presenceContainer.innerText = getPresenceNarrative(extractedData.presence_details || {}, accusedList);
  }

  // 6. Grammar terms toggle
  const terms = getLegalTerms(accusedList.length);
  document.querySelectorAll('.grammar-accused-term').forEach(el => {
    el.innerText = terms.accusedTerm;
  });
  document.querySelectorAll('.grammar-possessive-term').forEach(el => {
    el.innerText = terms.possesiveTerm;
  });
  document.querySelectorAll('.grammar-possessive-pronoun').forEach(el => {
    el.innerText = terms.possessivePronoun;
  });
  document.querySelectorAll('.grammar-from-term').forEach(el => {
    el.innerText = terms.fromTerm;
  });
  document.querySelectorAll('.grammar-accused-title-label').forEach(el => {
    el.innerText = terms.titleLabel;
  });
  document.querySelectorAll('.grammar-accused-header').forEach(el => {
    el.innerText = `अभियुक्त (${terms.accusedTerm}):`;
  });
  document.querySelectorAll('.grammar-accused-label-right').forEach(el => {
    el.innerText = `--------${terms.accusedTerm}`;
  });
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