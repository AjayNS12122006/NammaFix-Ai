NammaFix AI – Tamil Voice-Powered Civic Complaint Assistant 🇮🇳

Making civic complaint reporting simpler, smarter, and more accessible through AI-powered voice interaction.

NammaFix AI is a voice-powered civic complaint assistant designed to help citizens report local civic issues using Tamil, English, and Tanglish. It simplifies the reporting process through voice interaction, location-based complaint registration, automatic categorization, and ticket-based complaint tracking.

🎯 Problem Statement

Citizens often face difficulties reporting everyday civic problems such as garbage accumulation, water leakage, damaged roads, drainage issues, and streetlight failures.

Common challenges include:

- Language barriers in complaint registration.
- Complicated reporting procedures.
- Difficulty tracking complaint progress.
- Limited visibility into complaint management.

💡 Our Solution

NammaFix AI provides a simple, accessible platform where citizens can report civic problems using voice or text.

The platform helps organize complaints, capture location information, generate unique ticket IDs, and provide a tracking interface. Administrators can manage complaints through a centralized dashboard.

✨ Key Features

🎙️ Voice-Based Complaint Reporting

- Voice input for reporting civic issues.
- Designed for Tamil, English, and Tanglish interaction.
- Gnani AI Prisma Speech-to-Text integration.
- Gnani AI Timbre Text-to-Speech integration.

📍 Location-Based Reporting

- Capture complaint address and location details.
- Geocoding using OpenStreetMap Nominatim.
- Display validated complaint coordinates on a map.
- Preserve the original address supplied by the citizen.

📝 Complaint Management

- Categorize complaints by civic issue type.
- Record complaint descriptions and urgency.
- Generate unique complaint ticket IDs.
- Track complaint status.

📊 Admin Dashboard

- View and manage registered complaints.
- Monitor pending, in-progress, and resolved complaints.
- View complaint statistics and category distribution.
- Monitor complaint locations on a map.

🔎 Complaint Tracking

- Track complaints using ticket IDs.
- View available complaint status information.
- Improve transparency in the complaint management process.

🛠️ Technology Stack

Component| Technologies
Frontend| React.js, Vite
Styling| Tailwind CSS
Routing| React Router DOM
Backend| Node.js, Express.js
Database| MongoDB
AI Speech| Gnani AI Prisma and Timbre
Maps| React Leaflet, Leaflet
Geocoding| OpenStreetMap Nominatim
API Communication| Axios

🏗️ System Architecture

1. Citizen Interface: Citizens submit civic complaints using voice or text.
2. Voice Processing: Gnani AI speech services support speech recognition and voice responses.
3. Backend Processing: Express.js handles authentication, complaint registration, and tracking.
4. Database: MongoDB stores complaint and user information.
5. Location Services: Geocoding converts supported addresses into geographic coordinates.
6. Admin Interface: Administrators review and manage complaints.

🔄 Complaint Workflow

1. Citizen opens NammaFix AI.
2. Citizen enters a complaint using voice or text.
3. Complaint details and location are reviewed.
4. Citizen confirms the complaint.
5. Backend stores the complaint and generates a ticket ID.
6. Citizen tracks the complaint.
7. Administrator reviews and updates its status.

Note: The current platform provides an internal complaint management workflow. It does not claim official submission to a municipal corporation or government authority unless an authorized integration is configured.

🌍 Expected Impact

- Makes civic reporting easier for local-language users.
- Reduces barriers to submitting complaints.
- Improves visibility into complaint progress.
- Helps administrators organize and monitor civic issues.
- Provides a foundation for future authorized municipal integrations.

🚀 Future Enhancements

- Integration with authorized municipal complaint APIs.
- More regional language support.
- AI-assisted complaint classification.
- Image-based civic issue recognition.
- SMS and WhatsApp notifications.
- Municipal officer assignment and management.
- Advanced analytics and reporting.

⚙️ Installation and Setup

Prerequisites

- Node.js
- npm
- MongoDB
- Git

Clone the Repository

git clone https://github.com/AjayNS12122006/NammaFix-Ai.git
cd NammaFix-Ai

Backend Setup

cd backend
npm install

Create a ".env" file using the provided ".env.example" as a reference. Configure your MongoDB connection and required API credentials locally.

Start the backend:

npm run dev

Frontend Setup

Open another terminal:

npm install
npm run dev

Open the local Vite URL displayed in your terminal.

🔐 Security and Privacy

- Password hashing for account security.
- Role-based access for administrative features.
- Protected complaint management endpoints.
- Environment variables for sensitive configuration.
- Restricted access to private complaint records.

👨‍💻 Developer

Ajay N.S.

BE Computer Science and Engineering
Sri Shakthi Institute of Engineering and Technology

GitHub: https://github.com/AjayNS12122006

🏆 Project Information

Project Name: NammaFix AI
Challenge: The Great Indian AI Internship Challenge 2026
Domain: Artificial Intelligence | Voice AI | Civic Technology

---

NammaFix AI – Your Voice. Your Community. A Better Tomorrow.