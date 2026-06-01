OBJECTIVE
- Sign in project
- import csv feature but with rules that will ignore copy information (prevent duplicates)
database server postgreSQL
- UI - react web based with login system for teachers and sign up feature with email verification
- Student login screen - only put there student id or there full name
When student logs in it will automatically post 4 hour block on a column/ tracking sheet that will then autopopulate on the teacher side
- Teacher web based screen - Show who is actively signed in on side column and the main page will show theoretical head count automatically populated by teacher shift and room number.
- Break down the schedule to reflect this for teacher and include subject as a category for the teacher and their viewport permission default
- Have a side screen that allows teacher to automatically login a student - if they have issues for some reason
- After 10:55 there will be a change of shift from morning to afternoon class automatically for the next 4 hour block
- After the end of the month there will be a chron job to shift the cohort over one month to the next class and update the teacher view permissions

UI INTERFACE DETAILS
- will be a website portal where teacher or student can login
- Main Page will be login with heading of Attendance Log in - PTTI
- Main page will have a drop down box for setting up room name - this information will persist on the browser cookies. so next time main page is pulled it will automatically pick up from previous session the default room information
- drop down select box for Login As where you select to login as student or teacher
- teacher view upon login will show two tables (present students and theoretical head count) One on the left half and one on the right half with buttons in the middle. These buttons will be add student, login student, and change date drop down, and change shift drop down. Toward the top nav bar outside of the two tables there should be a button to enable School-wide (which will redirect to another pages which shows present, total, and percentage of each subject for the current shift)
- Shifts available will be morning afternoon evenining and night. Times for these will be 8:00 am 11:30 am 3:00PM and 7:00 PM
- Drop down button for subject: available subjects are PLC 1 PLC 2 DC 1 DC 2 AC 1 AC 2 MT and HT
- Details for table information will be pulled from one of two databases, the database with the main students information (details to be shown are student ID Name, and cohort month, and a check box that shows if they are present

DATABASE DETAILS
- When student logins with their student ID, they will be marked present for the day and their student profile will show up on the teacher view. The login is recorded for date, shift (automatically calculated upon login), and classroom 
- two profiles in the database: student profile (ID name and cohort month) and teacher profile (name, subject 1, subject 2, shift)
- there should be a table in the database which tracks login person, time, and date
