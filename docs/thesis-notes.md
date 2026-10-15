# Employee monitoring system using Artificial Intelligence

# Bachelor thesis

### Steps:

1. [X] Prepare both projects dependencies and folder structure (FE, BE)
2. [X] Create the database structure ( PostgreSQL )
3. [X] Create the models
3.1 [X] basic CRUD for them
3.2 [X] I also created vertical scaling through multi tenant app ( each tenant has its own database )
3.3 [X] I implemented roles and permissions and middlewares for them 
4. [X] Read RTSP stream
5. [X] Deliver RTSP stream to FE
5.1 [ ] Read about JWT and how to handle the token with COOKIES!!!
4. [ ] Create a login/register page simple for the begging
5. [ ] Prepare a few video files, people in an office and a construction site
6. [ ] JWT Auth like the teacher did at Web Tech ( you can copy that part )
7. [ ] Create a side-bar that can exapand or contract, the sidebar must contain the following buttons: ( asemanator cu HARP) - Emplyoees - Live cameras - Statistics - Settings - Logout
8. [ ] The employees page should contain - a table of employees that can be sorted based on name or other data - a button on which you register a new employee - CRUD operations - Each employee has an image of their face ( mugshot ) -> can be seen on the right or when hovering the image becomes bigger
9. [ ] On the Live feeds page you can see: - find how to set up cameras connection ( if you re not able to you can just use standard videos) - a grid box of live cameras ( idea maybe you can organize the cameras and make one bigger one smaller etc) - after clicking on one you can see it bigger and it will have 3 buttons - Here for the begging you can have a dropdown that let's you select what feature to apply to that camera
       ( 1. detect faces 2. detect PPE (includes faces aswell ) 3. Monitor people )
10. [ ] When clicking on the Monitor people feature - a button for setting the zone definition tool wil appear - clicking on it will take a screenshot of the live feed and ... ( see zone definition tool ) - it will be kept in the database that for that particular livestream you want to use the monitor people feature
11. [ ] When clicking on detect faces - it will start detecting faces - the unauthorized personel list button will appear - There you can select which people are allowed to be there or not, not mandatory - Every decision is saved in db
12. [ ] When clicking on detect PPE - it will start using the model that detects only PPE and the face - if any person is not having the whole equipment a db insertion is made togheter with an alert
13. [ ] For the settings page - the administrator can configure system settings such as: - Adding or removing users - Setting up alerts preferences - change password
14. [ ] Statistics
        - Histogram of each employee and the number of times it didn't wear the ppe
        - Total number of alerts / histogram based on level
        - Alerts per VideoCamera
        - Average time spent by employees in monitored zones
        - Number of unauthorized access attempts per day/week/month
        - PPE compliance rate over time
        - Number of alerts resolved vs unresolved
        - Employee attendance based on face recognition
        - Most frequently visited zones
        - Average response time to alerts
15. [X] Extra: create 2 separate type of accounts to leverage permissions -> one is administrator full access -> other is security personell -> cannot modifiy settings


### Database structure

Entity User 
  - username
  - password
  - email
  - phoneNumber

Entity Employee
  - firstName
  - lastName
  - phoneNumber
  - role
  - gender
  - profilePicture
  - encodedFace
  - department
Entity VideoCamera
  - id
  - ip
  - port
  - username
  - password
  - name
  - location
  - status  // active/inactive/error/offline

Entity PersonDetected
  - Employee foreign key
  - detected_at
  - VideoCamera foreign key

Entity Zone
  - VideoCamera foreign key
  - name
  - mask - bclr path to image

Entity Authorization
 - status - enum - allowed/notallowed -  1/0
 - Employee Foreign key
 - Zone Foreign key
 - createdAt
 - updatedAt

Entity Alert
 - timestamp
 - type
 - level - high/medium/low
 - Employee Fk
 - Zone Fk
 - screenshot
 - resolved - true/false - > can be set by administrator
 - timestampResolvedTrue
 - explanation

 Entity PPERecognitionItems
  - video_camera fk
  - ppe_id fk
  - is_present

Entity PPE
 - id
 - name

### Main Features:

- Video recording feature
 1. If an alert happens at least a screenshot is taken
 2. preferably a video that can be replayed

- Face recognition feature

  1. Create an UI that let's you upload an image or take a picture with your webcam, with info about the person ( eg. name, phone number )
  2. The picture is sent to the BE and encoded using face_recognition libary
  3. The encoded part is saved into the database
  4. Now the face can be detected in the video stream, retrieve the encoding part of the faces known and asses using the following methods if the face is in the frame:
  5. G:\Facultate\objectdetection101\objectdetectionenv\facerecognition\main.py

- Unauthorized list of personel

  1. Create an UI that lets the administrator select what persons are allowed to be seen on a particular video stream
  2. Send the data to BE
  3. For every person that is recognized in that video stream check if the person is allowed or not
  4. if not raise an alert

- Zone definition tool

  1. In react, the user must be able to create poylgons forms using react-konva
  2. The image is sent to the backend togheter with the coordinates of the points: everything inside the polygon remains the same, everything outside is drawn as black
  3. The image is then used as a mask against the video stream using an AND operator ( in RGB ) then applying the object detection model
  4. The coordinates are saved such that when delivered to FE the polygon is shown.
  5. To check if a person enters that zone you check after each iteration if the person detected falls inside the polygon coordinates

- Personal Protective equipment feature (PPE)
  1. Use the following dataset to train YOLO model: https://www.kaggle.com/datasets/snehilsanyal/construction-site-safety-image-dataset-roboflow?resource=download
  2. To train the yolo model use the following tutorial: https://www.youtube.com/watch?v=r0RspiLG260&list=WL&index=1
  3. Now you can use the model to find a diverse range of PPE
  4. If a person is detected and it does not have the complete list of PPE
  5. Insert a record in the database and raise an alert

## Arhitecture

1. Backend
   - Python
   - Flask
   - YOLO/OpenCV/face_recognition/Ultralytics
   - Postgres
        - TODO: Each entity is belongs to a group of users.
          For each group of users create a new database file
          Create a FK from all entities to the group
          Let the users from that group see only the data that it belongs to
        connection pooling/separate databases for each group

2. Frontend
   - React
   - Tailwind

## Facts

The videostream is processed only when clients ( from frontend ) are connected to the stream
Normally, the stream should be processed at all time
If you go to a video camera then you move around screens the stream is processed continously

fact2
rtsp urls are different for different cameras
so the actual /stream2 after url works only for tapo



## Questions

1. What is the best way to raise alerts in real time towards the FE (subscriber pattern)
2. How to differentiate between video streams? Each one should have an unique id
3. How to get the stream of the TAPO camera into the web browser? done
https://www.tp-link.com/us/support/faq/2680/
4. How do i stream to frontend? -> use WebRTC/aiortc

## Fun facts
1051 lines of code as of today 5/3/2025
at commit id: c0da60490a58ea256c3e6dabde9541d608faab65

1420 lines - 11/3/2025


2132.py 3864.jsx lines of code 24/04/2025
total = 5996


Sfaturi design:
- pastreaza consistenta intre butoane, tabele etc.
- la tabel in loc de 2 butoane sub actions pune doar unul cu meniu
- centreaza header ul cu logoul
- la login nu e marimea corecta la div
- camera video cu un mic div rotunjit sub camera cu text in div nu peste camera


comisie:
Vlad Diaconita
Andra Belciu
Bogdan Iancu
Toma Andrei secretar

23-27 iunie se incarca