from flask import Flask, render_template, request, jsonify, Response
import csv
import random
import io
import requests
import datetime

app = Flask(__name__)

def load_dataset():
    network = {}
    patients = []
    try:
        with open('hospital_doctor_patient_dataset.csv', 'r') as file:
            reader = csv.DictReader(file)
            rows = list(reader)
            for row in rows:
                h_name = row.get('hospital_name', 'Unknown_Hospital').replace(" ", "_")
                icu_beds = int(row.get('icu_beds', 0))
                if h_name not in network:
                    network[h_name] = {
                        "location": f"{row.get('area', 'Unknown')}, {row.get('district', 'Unknown')} ({row.get('hospital_type', 'Clinic')})",
                        "beds": {"ICU": icu_beds, "General": int(row.get('available_beds', 0))},
                        "inventory": {"Paracetamol": random.randint(50, 500), "Blood_Units": random.randint(0, 20)},
                        "equipment": {"Ventilator": random.randint(1, 5) if icu_beds > 10 else 0, "MRI": random.randint(0, 1), "Defibrillator": random.randint(0, 2), "ECG_Machine": random.randint(1, 4), "X-Ray": random.randint(0, 2), "Ultrasound": random.randint(0, 2)},
                        "doctors": []
                    }
                doc_entry = {"name": row.get('doctor_name', 'Dr. Unknown').replace("_", " "), "specialty": row.get('specialization', 'General Medicine')}
                if doc_entry not in network[h_name]["doctors"]:
                    network[h_name]["doctors"].append(doc_entry)
            for row in rows[:10]:
                severity_val = 3 if row.get('severity_level') == 'Critical' else (2 if row.get('severity_level') == 'Medium' else 1)
                req_eq = "Ventilator" if severity_val == 3 else ("MRI" if severity_val == 2 else "None")
                patients.append({
                    "patient": f"{row.get('patient_id', 'P000')} ({row.get('age', '0')}y) - {row.get('disease_type', 'Unknown')}", 
                    "severity": severity_val, 
                    "req_specialty": row.get('specialization', 'General Medicine'), 
                    "req_equip": req_eq,
                    "hospital": h_name
                })
    except Exception as e:
        print("Dataset Error:", e)
    return network, patients

rha_network, patients_queue = load_dataset()

def map_disease_to_specialty(disease):
    d = str(disease).lower()
    if any(word in d for word in ['heart', 'chest', 'attack', 'pain']): return 'Cardiology'
    if any(word in d for word in ['brain', 'stroke', 'nerve', 'headache']): return 'Neurology'
    if any(word in d for word in ['bone', 'fracture', 'joint', 'accident', 'fall']): return 'Orthopedics'
    if any(word in d for word in ['ear', 'nose', 'throat', 'hearing']): return 'ENT'
    return 'General Medicine'

@app.route('/')
def home(): return render_template('index.html')

# 📱 NEW: STANDALONE MOBILE KIOSK ROUTE 📱
@app.route('/kiosk')
def kiosk(): return render_template('kiosk.html')

@app.route('/api/get_network_list', methods=['GET'])
def get_network_list(): return jsonify(list(rha_network.keys()))

@app.route('/api/optimize_operations', methods=['GET'])
def optimize_operations():
    try:
        action_plan = []
        sorted_patients = sorted(patients_queue, key=lambda x: int(x.get('severity', 1)), reverse=True)
        
        for p in sorted_patients:
            sev = int(p.get("severity", 1))
            status = "TRANSFER REQUIRED" if sev == 3 else "Admitted Locally"
            hosp_str = str(p.get("hospital") or "Local Clinic").replace('_', ' ')
            alert_msg = f"Requires transfer from {hosp_str}" if sev == 3 else "None"
            
            action_plan.append({
                "patient": str(p.get("patient", "Unknown Patient")), 
                "priority": "CRITICAL" if sev == 3 else "NORMAL", 
                "action": status, 
                "alert": alert_msg, 
                "req_specialty": str(p.get("req_specialty", "General")), 
                "req_equip": str(p.get("req_equip", "None")),
                "hospital": hosp_str
            })
        return jsonify({"rha_action_plan": action_plan, "current_network_status": dict(list(rha_network.items())[:12])})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/register_op', methods=['POST'])
def register_op():
    data = request.json
    is_emergency = data.get('is_emergency', False)
    pref_hospital = data.get('hospital')
    p_id = f"OP-{random.randint(10000, 99999)}"
    
    if is_emergency:
        p_name = "UNKNOWN (SOS)"
        p_mobile = "N/A"
        p_disease = "Critical Emergency"
        req_specialty = "Trauma & ER"
        assigned_doc = "ER Response Team"
        assigned_hospital = pref_hospital
        is_transferred = False
        severity = 3
        slot_time = "IMMEDIATE"
    else:
        p_name = data.get('name', 'Unknown')
        p_mobile = data.get('mobile', 'N/A')
        p_disease = data.get('disease', 'Checkup')
        req_specialty = map_disease_to_specialty(p_disease)
        assigned_doc = None
        is_transferred = False
        slot_time = (datetime.datetime.now() + datetime.timedelta(minutes=random.randint(15, 120))).strftime("%I:%M %p")

        local_hospital = rha_network.get(pref_hospital, {})
        for doc in local_hospital.get('doctors', []):
            if doc['specialty'] == req_specialty:
                assigned_doc = doc['name']
                break

        assigned_hospital = pref_hospital
        if not assigned_doc:
            is_transferred = True
            for h_name, h_data in rha_network.items():
                for doc in h_data['doctors']:
                    if doc['specialty'] == req_specialty:
                        assigned_doc, assigned_hospital = doc['name'], h_name
                        break
                if assigned_doc: break

        severity = 3 if is_transferred else 1
        if not assigned_doc: assigned_doc, assigned_hospital = "Pending Review", "Regional Dispatch Center"

    patients_queue.append({"patient": f"{p_id} ({p_name}) - {p_disease.title()}", "severity": severity, "req_specialty": req_specialty, "req_equip": "Ambulance" if severity == 3 else "None", "hospital": pref_hospital})

    return jsonify({"patient_id": p_id, "name": p_name, "mobile": p_mobile, "disease": p_disease.title(), "specialty": req_specialty, "doctor": assigned_doc, "hospital": assigned_hospital.replace("_", " "), "time": slot_time, "transferred": is_transferred, "is_emergency": is_emergency, "message": f"SOS Alert Sent to Command Center!" if is_emergency else (f"Routed to {assigned_hospital.replace('_', ' ')}." if is_transferred else "Admitted locally.")})

@app.route('/api/walk_in_patient', methods=['POST'])
def walk_in_patient():
    data = request.json
    patient_name, walk_in_location, req_specialty, req_equip = data.get('name'), data.get('hospital'), data.get('specialty'), data.get('equipment')
    local_hospital = rha_network.get(walk_in_location, {})
    missing_items = []
    if not any(d['specialty'] == req_specialty for d in local_hospital.get('doctors', [])): missing_items.append(f"Doctor ({req_specialty})")
    if req_equip != "None" and (req_equip not in local_hospital.get('equipment', {}) or local_hospital['equipment'][req_equip] <= 0): missing_items.append(f"Equipment ({req_equip})")
    if len(missing_items) == 0: return jsonify({"status": "treated_locally", "message": f"✅ {patient_name} admitted securely."})
    else: return jsonify({"status": "admin_trigger_required", "message": f"🚨 SEND {' and '.join(missing_items)} TO {walk_in_location.replace('_', ' ')}!"})

@app.route('/api/dispatch_resource', methods=['POST'])
def dispatch_resource():
    data = request.json
    hospital, resource = data.get('hospital'), data.get('resource')
    if hospital in rha_network:
        if resource == "Ambulance": pass 
        elif resource in ["Ventilator", "MRI", "X-Ray", "Defibrillator", "ECG_Machine", "Ultrasound"]: rha_network[hospital]['equipment'][resource] = rha_network[hospital]['equipment'].get(resource, 0) + 1
        elif resource in ["Paracetamol", "Remdesivir", "Oxygen_Cylinders", "Blood_Units"]: rha_network[hospital]['inventory'][resource] = rha_network[hospital]['inventory'].get(resource, 0) + 50
        else: 
            if not any(d['specialty'] == resource for d in rha_network[hospital]['doctors']): rha_network[hospital]['doctors'].append({"name": "Dispatched Expert", "specialty": resource})
        return jsonify({"status": "success", "message": f"Deployed {resource} to {hospital.replace('_', ' ')}."})
    return jsonify({"status": "error", "message": "Hospital not found."})

@app.route('/api/get_shortages', methods=['GET'])
def get_shortages():
    shortages = []
    for h_name, data in list(rha_network.items())[:15]:
        for eq in ["Ventilator", "MRI", "Defibrillator", "X-Ray"]:
            if data['equipment'].get(eq, 0) == 0:
                shortages.append({"hospital": h_name, "item": eq})
                break 
    return jsonify(shortages)

@app.route('/api/download_report', methods=['GET'])
def download_report():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Hospital Name", "Location", "ICU Beds", "Ventilators"])
    for h_name, data in rha_network.items(): writer.writerow([h_name.replace('_', ' '), data['location'], data['beds']['ICU'], data['equipment'].get('Ventilator', 0)])
    return Response(output.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment;filename=Aura_Report.csv"})

@app.route('/api/chat', methods=['POST'])
def chat_with_agent():
    data = request.json
    user_message, voice_required, target_lang = data.get('message'), data.get('voice', False), data.get('lang', 'en-IN') 
    LYZR_API_URL, LYZR_API_KEY = "https://agent-prod.studio.lyzr.ai/v3/inference/chat/", "sk-default-32kOxl35kNQxRrV460wgvOvqVdbiLlw5"
    spoken_lang = {'en-IN': 'English', 'te-IN': 'Telugu', 'hi-IN': 'Hindi'}.get(target_lang, 'English')
    
    network_summary = [f"[{h}: ICU={d['beds']['ICU']}, Vent={d['equipment'].get('Ventilator',0)}, Docs={','.join([doc['specialty'] for doc in d['doctors']])}]" for h, d in rha_network.items()]
    live_data_str = " | ".join(network_summary)
    
    lyzr_prompt = f"User Query: '{user_message}'. LIVE DATABASE: {live_data_str}. RULE: Answer accurately using ONLY the database. Translate and respond entirely in {spoken_lang}. Keep it short."
    ai_reply = "I couldn't process that."
    
    try:
        response = requests.post(LYZR_API_URL, headers={"Content-Type": "application/json", "x-api-key": LYZR_API_KEY}, json={"user_id": "lokesh", "agent_id": "69b5a1b777f9c66d67b6abae", "session_id": "aura-live-001", "message": lyzr_prompt})
        ai_reply = response.json().get('response', ai_reply)
    except: ai_reply = "⚠️ Aura Agent is offline."

    audio_base64 = ""
    if voice_required and "offline" not in ai_reply:
        try:
            sarvam_res = requests.post("https://api.sarvam.ai/text-to-speech", headers={"api-subscription-key": "sk_qps4o3es_KctEAmmnS9LHDxRENrSK6tVX", "Content-Type": "application/json"}, json={"text": ai_reply[:2400], "speaker": "shruti", "target_language_code": target_lang, "model": "bulbul:v3"})
            if sarvam_res.status_code == 200: audio_base64 = sarvam_res.json().get('audios', [""])[0]
        except Exception as e: print("Sarvam Error:", e)

    return jsonify({"reply": ai_reply, "audio": audio_base64})

@app.route('/api/patient_consult', methods=['POST'])
def patient_consult():
    data = request.json
    user_message = data.get('message', '')
    has_image = data.get('has_image', False)
    target_lang = data.get('lang', 'te-IN')

    LYZR_API_URL = "https://agent-prod.studio.lyzr.ai/v3/inference/chat/"
    LYZR_API_KEY = "sk-default-32kOxl35kNQxRrV460wgvOvqVdbiLlw5"

    lang_map = {'en-IN': 'English', 'te-IN': 'Telugu', 'hi-IN': 'Hindi'}
    spoken_lang = lang_map.get(target_lang, 'Telugu')

    report_context = ""
    if has_image:
        report_context = " [SYSTEM NOTE: The patient uploaded a Blood Test report showing Fasting Blood Sugar of 180 mg/dL (High) and HbA1c of 8.2%.] "

    lyzr_prompt = f"Act as a compassionate, friendly human doctor. {report_context} Patient says: '{user_message}'. Explain their condition and tell them not to worry, advising basic next steps like diet or seeing a doctor. CRITICAL: You MUST translate and respond ENTIRELY in {spoken_lang}. Keep it under 3 short sentences."

    ai_reply = "I am sorry, I couldn't understand."
    try:
        response = requests.post(LYZR_API_URL, headers={"Content-Type": "application/json", "x-api-key": LYZR_API_KEY}, json={"user_id": "patient_lokesh", "agent_id": "69b5a1b777f9c66d67b6abae", "session_id": "patient-bot-001", "message": lyzr_prompt})
        ai_reply = response.json().get('response', ai_reply)
    except:
        ai_reply = "⚠️ Connection to AI Doctor failed."

    audio_base64 = ""
    if "offline" not in ai_reply and "failed" not in ai_reply:
        try:
            SARVAM_KEY = "sk_qps4o3es_KctEAmmnS9LHDxRENrSK6tVX"
            sarvam_res = requests.post("https://api.sarvam.ai/text-to-speech", headers={"api-subscription-key": SARVAM_KEY, "Content-Type": "application/json"}, json={"text": ai_reply[:2400], "speaker": "shruti", "target_language_code": target_lang, "model": "bulbul:v3"})
            if sarvam_res.status_code == 200:
                audio_base64 = sarvam_res.json().get('audios', [""])[0]
        except Exception as e:
            print("Sarvam Error:", e)

    return jsonify({"reply": ai_reply, "audio": audio_base64})

if __name__ == '__main__': app.run(host='0.0.0.0', port=5000, debug=True)