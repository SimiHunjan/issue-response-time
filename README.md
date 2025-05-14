# 🕒 Issue Response Time Tracker

A Node.js script that analyzes GitHub issues across multiple repositories and calculates how long it takes for maintainers to respond to community-submitted issues. It helps track responsive times. 

---

## 🚀 Features

- Pulls issues (open or closed) from specified GitHub repositories from the provided date (default March 2025)
- Filters out issues opened by maintainers
- Calculates time to first response from a maintainer
- Flags whether the response was within **48 business hours**
- Outputs:
  - A CSV of all analyzed issues
  - A summary CSV with response rate metrics per repo

---

## 📁 Getting Started
- Clone the repository 
- Rename the `example.env` file to `.env`
- Enter your GitHub token in the  `.env`
- Run the script `node issueResponseTime.js`
- View the CSV report or console log print out

  
![Screenshot 2025-05-14 at 4 16 06 PM](https://github.com/user-attachments/assets/5e2f7354-ee3a-48a5-9b9a-83593c791c5e)
