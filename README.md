# ArogyaNet AI

## Overview

ArogyaNet AI is a simple AI-based telehealth system designed for rural
areas. It helps patients report symptoms and receive basic health risk
analysis. The system supports both text and voice input and can work
even when internet connectivity is weak.

## Problem Statement

Many rural areas do not have easy access to doctors or hospitals.
Because of this, diseases are often detected late and patients cannot
monitor their health regularly. ArogyaNet AI helps provide early health
support and better communication with healthcare providers.

## Core Objectives

-   Collect patient symptoms and basic health data
-   Predict possible health risks using AI
-   Classify cases as Emergency, Urgent, or Routine
-   Allow voice-based symptom reporting
-   Store patient data safely
-   Support healthcare services even in offline conditions

## Offline Data Architecture

The system follows an offline-first approach.\
When a patient enters or speaks symptoms, the data is saved locally on
the device.\
If the internet is unavailable, the data stays stored on the device.\
Once the internet connection returns, the data automatically syncs with
the server.

## Technology Stack

Frontend: React / Flutter\
Backend: Python (FastAPI / Flask)\
AI & ML: Scikit-learn, TensorFlow\
Voice Processing: Sarvam AI\
Database: MongoDB / Firebase\
Local Storage: SQLite\
Security: AES Encryption and JWT Authentication

## AI Models Used

-   Logistic Regression for health risk prediction
-   Random Forest for disease classification
-   Natural Language Processing (NLP) for symptom analysis

## User Interface Components

Patient Dashboard -- enter symptoms and view health status\
Voice Assistant -- speak symptoms in local language\
Doctor Dashboard -- monitor patient risk levels\
Hospital Panel -- manage emergency cases and resources

## Voice Support

The system allows patients to report symptoms using voice. Speech is
converted to text using Sarvam AI and then analyzed by the AI model to
detect possible health risks.

## Conclusion

ArogyaNet AI helps improve healthcare access in rural areas by combining
AI prediction, voice support, and offline functionality. It enables
early detection of health risks and better communication between
patients and healthcare providers.
