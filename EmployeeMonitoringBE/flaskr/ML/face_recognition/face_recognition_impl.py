# https://pypi.org/project/face-recognition/
# TODO: Make sure yo uhave CUDA Enabled

# Func1:
# Get a picture of an employee face
# Encode it and save the encoded face in the database ( saving can be done in router, encoding here)
def encode_picture(image):
    import face_recognition  # dlib is heavy; load it only when a picture is encoded

    image_array = face_recognition.load_image_file(image)    
    list_of_face_encodings = face_recognition.face_encodings(image_array)
    if len(list_of_face_encodings) > 1:
        raise Exception("Multiple faces detected")
    elif len(list_of_face_encodings) == 1:
        return list_of_face_encodings[0]
    else:
        raise Exception("No face detected")
# Func2:
# Recognize the face of an employee
# Extract the encoded part from the db
# employees is a list of employees
def recognize_faces(image, employees: list):
    pass
