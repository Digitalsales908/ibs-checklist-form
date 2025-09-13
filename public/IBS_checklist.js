// IBS Diagnosis Checklist Progress Script
const sectionIds = ['sec-1', 'sec-2', 'sec-3', 'sec-4'];

function updateOverallProgress() {
  const allCheckboxes = document.querySelectorAll('.check-item');
  const nullTypeOptions = [
    'Like a sausage with cracks',
    'Smooth, soft sausage or snake',
    'Soft blobs with clear-cut edges'
  ];

  const validCheckboxes = [...allCheckboxes].filter(cb => {
    const label = cb.parentElement.textContent.trim();
    return !nullTypeOptions.some(option => label.includes(option));
  });

  const totalChecked = validCheckboxes.filter(cb => cb.checked).length;
  const totalCheckboxes = validCheckboxes.length || 0;
  const overallPercent = totalCheckboxes === 0 ? 0 : (totalChecked / totalCheckboxes) * 100;

  const overallPercentageText = document.getElementById('overall-percentage');
  const hiddenField = document.getElementById('overall-percentage-value');
  const currentRiskLabel = document.getElementById('current-risk-label');
  const lowRiskMessage = document.getElementById('low-risk-message');
  const moderateRiskMessage = document.getElementById('moderate-risk-message');
  const highRiskMessage = document.getElementById('high-risk-message');

  if (overallPercentageText && currentRiskLabel) {
    // ✅ Show exact value with 2 decimals
    overallPercentageText.textContent = overallPercent.toFixed(0) + '%';

    // ✅ Save raw number for backend
    if (hiddenField) hiddenField.value = Math.round(overallPercent); 
    // (keep your existing risk level + messages logic here)
    currentRiskLabel.classList.remove('no-risk', 'low-risk', 'moderate-risk', 'high-risk');
    const overallFill = document.getElementById('overall-progress-fill');
    if (overallFill) {
      overallFill.style.width = overallPercent + '%';
      overallFill.classList.remove('low', 'moderate', 'high');
      const roundedPercent = Math.round(overallPercent);
      if (roundedPercent >= 1 && roundedPercent <= 20) {
        overallFill.classList.add('low');
        currentRiskLabel.textContent = 'Low';
        currentRiskLabel.classList.add('low-risk');
        if (lowRiskMessage) lowRiskMessage.style.display = 'block';
        if (moderateRiskMessage) moderateRiskMessage.style.display = 'none';
        if (highRiskMessage) highRiskMessage.style.display = 'none';
      } else if (roundedPercent >= 21 && roundedPercent <= 40) {
        overallFill.classList.add('moderate');
        currentRiskLabel.textContent = 'Moderate';
        currentRiskLabel.classList.add('moderate-risk');
        if (lowRiskMessage) lowRiskMessage.style.display = 'none';
        if (moderateRiskMessage) moderateRiskMessage.style.display = 'block';
        if (highRiskMessage) highRiskMessage.style.display = 'none';
      } else if (roundedPercent >= 41) {
        overallFill.classList.add('high');
        currentRiskLabel.textContent = 'High';
        currentRiskLabel.classList.add('high-risk');
        if (lowRiskMessage) lowRiskMessage.style.display = 'none';
        if (moderateRiskMessage) moderateRiskMessage.style.display = 'none';
        if (highRiskMessage) highRiskMessage.style.display = 'block';
      } else {
        overallFill.classList.remove('low', 'moderate', 'high');
        currentRiskLabel.textContent = '';
        if (lowRiskMessage) lowRiskMessage.style.display = 'none';
        if (moderateRiskMessage) moderateRiskMessage.style.display = 'none';
        if (highRiskMessage) highRiskMessage.style.display = 'none';
      }
    }
  }
}

// Update individual section progress
sectionIds.forEach(sec => {
  const checkboxes = document.querySelectorAll(`.check-item.${sec}`);
  const progress = document.getElementById(`progress-${sec}`);
  const percentText = document.getElementById(`percent-${sec}`);
  
  function updateProgress() {
  if (sec === 'sec-3') {
      // Special handling for section 3
      const firstThreeOptions = [
        'Symptoms > 6 months in duration',
        'Abdominal pain ≥1 day/week',
        'Pain related to defecation'
      ];
      // Types 3, 4, 5 (null value):
      const nullOptions = [
        'Like a sausage with cracks',
        'Smooth, soft sausage or snake',
        'Soft blobs with clear-cut edges'
      ];
      // Types 1, 2, 6, 7 (each 6.25% of remaining 25%):
      const typeOptions = [
        'Separate hard lumps, like nuts (hard to pass)',
        'Lumpy and sausage-shaped',
        'Mushy with ragged edges',
        'Watery, no solid pieces'
      ];
      let weightedScore = 0;
      
      [...checkboxes].forEach(cb => {
        const label = cb.parentElement.textContent.trim();
        if (cb.checked) {
          if (firstThreeOptions.some(option => label.includes(option))) {
            // Each of first three options worth 25%
            weightedScore += 25;
          } else if (nullOptions.some(option => label.includes(option))) {
            // Null value, do not add to score
          } else if (typeOptions.some(option => label.includes(option))) {
            // Remaining 25% divided among valid type options (25/4 = 6.25% each)
            weightedScore += 6.25;
          }
        }
      });
      const percent = Math.round(weightedScore);
      progress.style.width = percent + '%';
      percentText.textContent = percent + '%';
    } else if (sec === 'sec-4') {
      // Special handling for section 4
      const firstFourOptions = [
        'Blood in stool',
        'Anemia or low hemoglobin',
        'Abdominal mass',
        'Fecal Incontinence'
      ];
      let weightedScore = 0;
      let validOtherCount = 0;
      // Count only non-first-four for remaining 50%
      [...checkboxes].forEach(cb => {
        const label = cb.parentElement.textContent.trim();
        if (!firstFourOptions.some(option => label.includes(option))) {
          validOtherCount++;
        }
      });
      [...checkboxes].forEach(cb => {
        const label = cb.parentElement.textContent.trim();
        if (cb.checked) {
          if (firstFourOptions.some(option => label.includes(option))) {
            weightedScore += 12.5;
          } else {
            // Other options share the remaining 50%
            weightedScore += (validOtherCount > 0 ? (50 / validOtherCount) : 0);
          }
        }
      });
      const percent = Math.round(weightedScore);
      progress.style.width = percent + '%';
      percentText.textContent = percent + '%';
    } else {
      // Normal calculation for other sections
      const total = checkboxes.length;
      const checked = [...checkboxes].filter(c => c.checked).length;
      const percent = Math.round((checked / total) * 100);
      progress.style.width = percent + '%';
      percentText.textContent = percent + '%';
    }
    // Update overall progress whenever any section changes
    updateOverallProgress();
  }
  
  checkboxes.forEach(cb => cb.addEventListener('change', updateProgress));
});

// Function to handle auto-selection between sections
function setupAutoSelection() {
  // Find the checkbox for "Change in bowel frequency and stool form and shape" in section 1
  const section1Checkboxes = document.querySelectorAll('.check-item.sec-1');
  const bowelChangeCheckbox = [...section1Checkboxes].find(checkbox => 
    checkbox.parentElement.textContent.includes('Change in bowel frequency and stool form and shape')
  );

  // Find the checkbox for "Stool changes in form/frequency" in section 3
  const section3Checkboxes = document.querySelectorAll('.check-item.sec-3');
  const stoolChangesCheckbox = [...section3Checkboxes].find(checkbox => 
    checkbox.parentElement.textContent.includes('Stool changes in form/frequency')
  );

  if (bowelChangeCheckbox && stoolChangesCheckbox) {
    bowelChangeCheckbox.addEventListener('change', function() {
      stoolChangesCheckbox.checked = this.checked;
      // Trigger the change event to update progress
      stoolChangesCheckbox.dispatchEvent(new Event('change'));
    });
  }
}


// Form validation functions
function validateName(name) {
  return name.trim().length >= 2;
}

function validateAge(age) {
  const ageNum = parseInt(age);
  return !isNaN(ageNum) && ageNum > 0 && ageNum < 120;
}

function validateGender(gender) {
  return gender.trim() !== "";
}

function validateMobile(mobile) {
  const mobileRegex = /^[0-9]{10}$/;
  return mobileRegex.test(mobile.trim());
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

function showError(inputElement, message) {
  const existingError = inputElement.nextElementSibling;
  if (existingError && existingError.className === 'error-message') {
    existingError.textContent = message;
  } else {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.color = 'red';
    errorDiv.style.fontSize = '12px';
    errorDiv.style.marginTop = '5px';
    errorDiv.textContent = message;
    inputElement.parentNode.appendChild(errorDiv);
  }
  inputElement.style.borderColor = 'red';
}

function clearError(inputElement) {
  const existingError = inputElement.nextElementSibling;
  if (existingError && existingError.className === 'error-message') {
    existingError.remove();
  }
  inputElement.style.borderColor = '';
}

function validateForm() {
  let isValid = true;
  
  // Get form elements
  const nameInput = document.getElementById('name');
  const ageInput = document.getElementById('age');
  const sexInput = document.getElementById('sex');
  const phoneInput = document.getElementById('phone');
  const emailInput = document.getElementById('email');
  
  // Clear previous errors
  clearError(nameInput);
  clearError(ageInput);
  clearError(sexInput);
  clearError(phoneInput);
  clearError(emailInput);
  
  // Validate name
  if (!validateName(nameInput.value)) {
    showError(nameInput, 'Please enter a valid name (at least 2 characters)');
    isValid = false;
  }
  
  // Validate age
  if (!validateAge(ageInput.value)) {
    showError(ageInput, 'Please enter a valid age (1-119)');
    isValid = false;
  }
  
  // Validate gender
  if (!validateGender(sexInput.value)) {
    showError(sexInput, 'Please select a gender');
    isValid = false;
  }
  
  // Validate phone
  if (phoneInput.value && !validateMobile(phoneInput.value)) {
    showError(phoneInput, 'Please enter a valid 10-digit phone number');
    isValid = false;
  }
  
  // Validate email
  if (emailInput.value && !validateEmail(emailInput.value)) {
    showError(emailInput, 'Please enter a valid email address');
    isValid = false;
  }
  
  return isValid;
}

// Modal functionality
function showModal(name, age, gender, phone, email, riskLevel, percentage, message) {
  const modal = document.getElementById('summaryModal');
  
  // Update modal content
  document.getElementById('modal-name').textContent = name;
  document.getElementById('modal-age').textContent = age;
  document.getElementById('modal-gender').textContent = gender;
  document.getElementById('modal-phone').textContent = phone;
  document.getElementById('modal-email').textContent = email;
  
  const modalRiskLevel = document.getElementById('modal-risk-level');
  modalRiskLevel.textContent = riskLevel;
  modalRiskLevel.className = 'risk-value ' + riskLevel.toLowerCase();
  
  document.getElementById('modal-percentage').textContent = percentage + '%';
  document.getElementById('modal-message').textContent = message;
  document.getElementById('modal-message').className = 'summary-message ' + riskLevel.toLowerCase();

  // Update progress bar
  const progressFill = document.getElementById('modal-progress-fill');
  progressFill.style.width = percentage + '%';
  progressFill.className = riskLevel.toLowerCase();

  // Show modal
  modal.style.display = 'block';
  
  // Re-enable the submit button
  const submitButton = document.getElementById('submitBtn');
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.style.opacity = '1';
    submitButton.style.cursor = 'pointer';
  }
}

// Initialize overall progress and auto-selection on page load
document.addEventListener('DOMContentLoaded', function() {
  updateOverallProgress();
  setupAutoSelection();
  
  const form = document.getElementById("checklist-form");
  if (!form) return;
  
  // Add input event listeners for real-time validation
  const nameInput = document.getElementById('name');
  const ageInput = document.getElementById('age');
  const sexInput = document.getElementById('sex');
  const phoneInput = document.getElementById('phone');
  const emailInput = document.getElementById('email');

  nameInput.addEventListener('input', function() {
    if (validateName(this.value)) {
      clearError(this);
    }
  });

  ageInput.addEventListener('input', function() {
    if (validateAge(this.value)) {
      clearError(this);
    }
  });

  sexInput.addEventListener('change', function() {
    if (validateGender(this.value)) {
      clearError(this);
    }
  });

  phoneInput.addEventListener('input', function() {
    if (validateMobile(this.value)) {
      clearError(this);
    }
  });

  emailInput.addEventListener('input', function() {
    if (validateEmail(this.value)) {
      clearError(this);
    }
  });

  // Set up modal close functionality
  const modal = document.getElementById('summaryModal');
  const closeButton = document.getElementsByClassName('close-button')[0];
  
  // Close modal when clicking the X button
  if (closeButton) {
    closeButton.onclick = function() {
      modal.style.display = 'none';
    }
  }

  // Close modal when clicking outside
  window.onclick = function(event) {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  }
  
  // Handle form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Validate the form before submission
    if (!validateForm()) {
      // Scroll to the first error
      const firstError = document.querySelector('.error-message');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    
    // Get and disable the submit button
    const submitButton = document.getElementById('submitBtn');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.style.opacity = '0.5';
      submitButton.style.cursor = 'not-allowed';
    }
    
    // If validation passes, submit the form
    const formData = new FormData(form);

    try {
      const response = await fetch("/submit", {
        method: "POST",
        body: formData
      });

      const result = await response.json();
      
      if (result.success) {
        // Get form values for modal
        const name = document.getElementById('name').value;
        const age = document.getElementById('age').value;
        const sex = document.getElementById('sex').value;
        const phone = document.getElementById('phone').value;
        const email = document.getElementById('email').value;
        
        // Get current risk level and percentage
        const percentage = parseInt(document.getElementById('overall-percentage').textContent);
        let riskLevel = '';
        let message = '';

        if (percentage >= 41) {
          riskLevel = 'High';
          message = document.getElementById('high-risk-message').textContent;
        } else if (percentage >= 21) {
          riskLevel = 'Moderate';
          message = document.getElementById('moderate-risk-message').textContent;
        } else if (percentage >= 1) {
          riskLevel = 'Low';
          message = document.getElementById('low-risk-message').textContent;
        } else {
          riskLevel = 'No Risk';
          message = 'No significant IBS symptoms detected.';
        }

        // Get country code and format phone number
        const countryCode = document.getElementById('country-code') ? document.getElementById('country-code').value : '';
        const fullPhone = countryCode && phone ? countryCode + ' ' + phone : phone;

        // Remove any existing success popup
        const existingPopup = document.querySelector('.success-popup');
        if (existingPopup) {
          existingPopup.remove();
        }

        // Show success popup immediately
        const successPopup = document.createElement('div');
        successPopup.className = 'success-popup';
        successPopup.innerHTML = `
          <div class="success-content">
            <div class="success-icon">✓</div>
            <div class="success-message">Form submitted successfully!</div>
          </div>
        `;
        document.body.appendChild(successPopup);

        // Clear any existing timeouts
        if (window.modalTimeout) {
          clearTimeout(window.modalTimeout);
        }

        // Remove the popup and show modal after 3 seconds
        window.modalTimeout = setTimeout(() => {
          if (successPopup && successPopup.parentNode) {
            successPopup.remove();
          }
          showModal(name, age, sex, fullPhone, email, riskLevel, percentage, message);
        }, 3000);
        
        // Optionally reset the form
        form.reset();
        
        // Reset progress indicators
        updateOverallProgress();
        sectionIds.forEach(sec => {
          const progress = document.getElementById(`progress-${sec}`);
          const percentText = document.getElementById(`percent-${sec}`);
          if (progress && percentText) {
            progress.style.width = '0%';
            percentText.textContent = '0%';
          }
        });
      } else {
        alert("Error: " + result.message);
        // Re-enable submit button on error
        const submitButton = document.getElementById('submitBtn');
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.style.opacity = '1';
          submitButton.style.cursor = 'pointer';
        }
      }
    } catch (error) {
      alert("An error occurred while submitting the form. Please try again.");
      console.error("Form submission error:", error);
      // Re-enable submit button on error
      const submitButton = document.getElementById('submitBtn');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.style.opacity = '1';
        submitButton.style.cursor = 'pointer';
      }
    }
  });
});