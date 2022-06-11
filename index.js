const express = require('express')
const { MongoClient, ObjectID } = require('mongodb');
const app = express()
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fileUpload = require('express-fileUpload');
const bcrypt = require('bcrypt');

require('dotenv').config();

app.use(express.json());
app.use(cors());
app.use(fileUpload());

const port = process.env.PORT || 4545;

// console.log(process.env.DB_NAME)
const newUri = `mongodb+srv://${process.env.DB_USER_NAME}:${process.env.DB_PASS}@cluster0.fsyqv.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const newClient = new MongoClient(newUri, { useNewUrlParser: true, useUnifiedTopology: true });

app.get('/', (req, res) => {
    res.send('Backend Working fine!');
})


newClient.connect(err => {
    const regUserCollection = newClient.db('doccure_database').collection("usersCollection");
    const adminCollection = newClient.db('doccure_database').collection("admin-collection");
    const doctorCollection = newClient.db('doccure_database').collection("doctor_collection");
    const appointMentCollection = newClient.db('doccure_database').collection("appointment_collection");
    const patientCollectionByDoctorAppointment = newClient.db('doccure_database').collection('patient_collection_by_doctor_appointment');
    //user register function
    app.post('/auth/registration', (req, res) => {
        const authData = req.body;
        const user = { user: authData.email };
        const accessToken = generateAccessToken(user);
        authData.token = accessToken;
        const age = getAge(authData.dateOfBirth);
        authData.age = age;
        //check the user type
        if (authData.userType === 'patient') {
            registerPatients(authData, res);

        } else if (authData.userType === 'doctor') {
            registerDoctor(authData, res);
        }
    })

    //update profile api
    app.post('/auth/update-profile/:id', (req, res) => {
        // console.log(req.body);
        // console.log(req.body._id);

        console.log('kiree');
        const { userType } = req.body;
        console.log(userType);
        if (userType === 'patient') {
            updatePatientProfile(req, res);

        } else if (userType === 'doctor') {
            updateDoctorProfile(req, res);
        }


    })

    //validate auth api
    app.post('/auth/validateUser', async(req, res) => {
        const userToken = req.body;
        console.log(userToken);
        try {
            await regUserCollection.findOne({ token: userToken.token })
                .then(result => {
                    if (result) {
                        res.status(200).send({ success: true, data: result })
                    } else {
                        res.status(400).send({ success: false, data: null })
                    }
                })
        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'Something went wrong! ' })
        }
    })

    // login function
    app.post('/auth/login', async(req, res) => {
        const authData = req.body;
        // console.log(authData);
        const user = { user: authData.email };
        const accessToken = generateAccessToken(user);
        authData.token = accessToken;
        // const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET)
        // authData.token = accessToken;
        if (authData.userType === 'patient') {
            patientLogin(authData, res);
        } else if (authData.userType === 'doctor') {
            doctorLogin(authData, res);
        }

    })

    //admin login api
    app.post('/admin/login', (req, res) => {
        const adminDetails = {};
        const { email, password } = req.body;
        adminDetails.email = email;
        adminDetails.password = password;
        const adminToken = { email: adminDetails.email }
        const accessToken = generateAccessToken(adminToken);
        adminDetails.token = accessToken;
        adminLogin(adminDetails, res);
    })

    //get user data operation
    app.get('/userDetail/:email/:userType', (req, res) => {
        const { userType } = req.params;
        // console.log(userType);
        if (userType === 'patient') {
            getUserDetails(req.params.email, res);
        } else if (userType === 'doctor') {
            getDoctorDetails(req.params.email, res)
        }

    })

    // get doctor details
    app.get('/doctorDetails/:id', (req, res) => {
        const { id } = req.params;
        getDoctorDetailsById(id, res);
    })


    app.get('/getAllDoctors', (req, res) => {
        getAllDoctors(res);
    })

    //doctor verify
    app.post('/verifyDoctor', async(req, res) => {
        const { isVerified, id } = req.body;
        try {
            await doctorCollection.updateOne({ _id: ObjectID(id) }, {
                    $set: { isVerified: isVerified },
                })
                .then(result => {
                    if (result.acknowledged) {
                        res.status(200).send({ success: true, data: result, message: 'Updated Successfully' });
                    } else res.status(404).send({ success: false, data: null, message: 'Update failed' })
                })
        } catch (error) {
            res.status(500).send({ success: false, data: null, message: error })
        }
    })

    app.get('/getAllVerifiedDoctor', async(req, res) => {
        try {
            doctorCollection.find({ isVerified: true }).toArray((err, items) => {
                if (items.length > 0) {
                    res.status(200).send({ success: true, data: items, message: 'doctors data Found!' });
                } else res.status(404).send({ success: false, data: null, message: 'No verified user found!' });
            })

        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'Something went wrong!' });
        }
    })


    //create booking api
    app.post('/appointmentBooking', (req, res) => {
        // console.log(req.body)
        let appointmentData = {}
        appointmentData = req.body;

        createAppointmentBooking(appointmentData, res);

        patientListByDoctorAppointments(appointmentData.patientId, appointmentData.doctorId, res)

    })


    //replace new appointmentData

    app.post('/finalBooking', (req, res) => {
        const { bookingOrderId, payload } = req.body;
        console.log(bookingOrderId, payload);
        updateAppointmentBooking(bookingOrderId, payload, res)
    })

    app.get('/appointment-by-doctor/:id', (req, res) => {
        console.log(req.params);
        const { id } = req.params;
        getAllAppointmentsById(id, res)
    })

    app.get('/patient_list_by_doctor_appointment/:id', (req, res) => {
        const { id } = req.params;
        // console.log(id);
        getPatientListByDoctorId(id, res)
    })

    // change appointment status api
    app.post('/changeAppointmentStatus', (req, res) => {
        const { appointmentStatus, id } = req.body;
        changeAppointmentStatus(appointmentStatus, id, res);
    })

    const changeAppointmentStatus = async(appointmentStatus, id, res) => {
        try {
            await appointMentCollection.updateOne({ _id: ObjectID(id) }, {
                    $set: { appointmentStatus: appointmentStatus }
                })
                .then(result => {
                    if (result.acknowledged) {
                        return res.status(200).send({ success: true, data: result, message: 'Updated Successfully' });
                    } else {
                        res.status(404).send({ success: false, data: null, message: 'No Data Found!' });
                    }
                })
        } catch (error) {
            console.log(error);
            res.status(500).send({ success: false, data: null, message: error })
        }
    }

    const getPatientListByDoctorId = async(id, res) => {
        try {
            patientCollectionByDoctorAppointment.find({ doctorId: id }).toArray((err, items) => {
                // console.log(items);
                if (items) {
                    res.status(200).send({ success: true, data: items, message: 'Patient data Found!' });
                } else {
                    res.status(404).send({ success: false, data: null, message: 'No Data Found!' });
                }

            })
        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'Something went wrong!' })
        }
    }

    const patientListByDoctorAppointments = async(patientId, doctorId, res) => {
        console.log('hittt');
        let data = { patientId: patientId, doctorId: doctorId }
        try {
            await regUserCollection.findOne({ _id: ObjectID(patientId) })
                .then(async result => {
                    if (result) {
                        data.patientDetails = result;
                        try {
                            await patientCollectionByDoctorAppointment.findOne({ patientId: patientId })
                                .then(async result => {
                                    if (!result) {
                                        await patientCollectionByDoctorAppointment.insertOne(data)
                                            .then(data => {
                                                if (data) {
                                                    res.status(201).send({ success: true, data: data, message: 'success' });
                                                } else {
                                                    res.status(false).send({ success: false, data: null, message: 'falied' });
                                                }
                                            })
                                            .catch(err => {
                                                res.status(500).send({ success: false, data: null, message: err })
                                            });
                                    }
                                })
                                .catch(error => {
                                    res.status(500).send({ success: false, data: null, message: error })
                                })
                        } catch (error) {
                            res.status(500).send({ success: false, data: null, message: err })
                        }

                    } else res.status(404).send({ success: false, data: null, message: 'not found' });
                })
        } catch (error) {
            return error;
        }




    }

    const getAllAppointmentsById = async(id, res) => {
        try {
            await appointMentCollection.find({ doctorId: id }).toArray((err, items) => {
                if (items) {
                    res.status(200).send({ success: true, data: items, message: 'Appointments data Found!' });
                } else {
                    res.status(404).send({ success: false, data: null, message: 'No Data Found!' });
                }

            })

        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'No Data Found!' });
        }

    };

    const updateAppointmentBooking = async(bookingOrderId, payload, res) => {
        try {
            await appointMentCollection.replaceOne({ _id: ObjectID(bookingOrderId) }, payload)
                .then(result => {
                    if (result) {
                        res.status(201).send({ success: true, data: result, message: 'success' });
                    } else {
                        res.status(404).send({ success: false, data: null, message: 'failed!' });
                    }
                })
                .catch(err => {
                    res.status(500).send({ success: false, data: null, message: err })
                });

        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'something went wrong!' });
        }
    }

    const createAppointmentBooking = async(appointmentData, res) => {
        try {
            await appointMentCollection.insertOne(appointmentData)
                .then(result => {
                    if (result) {
                        res.status(201).send({ success: true, data: result, message: 'success' });
                    } else {
                        res.status(404).send({ success: false, data: null, message: 'failed!' });
                    }
                })
                .catch(err => {
                    res.status(500).send({ success: false, data: null, message: err })
                });

        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'something went wrong!' });
        }
    }

    //update patient info function
    const updatePatientProfile = async(req, res) => {
        let newPatientData = {}
        const patientData = req.body;
        const updatedAge = getAge(patientData.dateOfBirth);
        newPatientData = {...patientData }
        newPatientData.age = updatedAge;
        console.log(newPatientData);
        const { address, bloodGroup, city, country, dateOfBirth, firstName, gender, lastName, phoneNumber, state, zipCode, photoUrl } = newPatientData;

        try {
            await regUserCollection.updateOne({ email: newPatientData.email }, {
                    $set: { firstName: firstName, lastName: lastName, bloodGroup: bloodGroup, country: country, address: address, city: city, dateOfBirth: dateOfBirth, phoneNumber: phoneNumber, state: state, zipCode: zipCode, photoUrl: photoUrl, gender: gender }
                })
                .then(result => {
                    if (result) {
                        // res.status(200).send({ success: true, data: result, message: 'success' })
                        if (result.acknowledged) {
                            patientCollectionByDoctorAppointment.replaceOne({ patientId: newPatientData._id }, { patientDetails: newPatientData })
                                .then((finalResult) => {
                                    if (finalResult) res.send({ success: true, data: result, message: 'All Updated Success fully' });
                                    else res.status(404).send({ success: false, data: result, message: 'All Update failed' })
                                })
                        } else res.status(404).send({ success: false, data: result, message: 'Update failed' })
                    } else {
                        res.status(404).send({ success: false, data: null, message: 'ki wrong!' })
                    }

                })
        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'Something went wrong!' })
        }
    }

    // update doctor profile function
    const updateDoctorProfile = async(req, res) => {
        console.log('come on');
        console.log('come on');
        const {
            _id,
            firstName,
            lastName,
            email,
            gender,
            dateOfBirth,
            bloodGroup,
            phoneNumber,
            state,
            address,
            city,
            zipCode,
            country,
            photoUrl,
            designation,
            institutionName,
            gradStart,
            gradEnd,
            specialty,
            isVerified,
            appointmentFee
        } = req.body;
        const updatedAge = getAge(dateOfBirth);
        try {
            await doctorCollection.updateOne({ _id: ObjectID(_id) }, {
                    $set: { firstName: firstName, lastName: lastName, email: email, gender: gender, dateOfBirth: dateOfBirth, bloodGroup: bloodGroup, phoneNumber: phoneNumber, state: state, address: address, city: city, zipCode: zipCode, country: country, photoUrl: photoUrl, age: updatedAge, designation: designation, institutionName: institutionName, gradStart: gradStart, gradEnd: gradEnd, specialty: specialty, isVerified: isVerified, appointmentFee: appointmentFee },
                })
                .then(result => {
                    if (result.acknowledged) {
                        res.status(200).send({ success: true, data: result, message: 'Updated Successfully' });
                    } else res.status(404).send({ success: false, data: result, message: 'Update failed' })
                })
                .catch(err => {
                    res.status(404).send({ success: false, data: result, message: 'Update failed' })
                })
        } catch (error) {
            res.status(404).send({ success: false, data: result, message: 'Something went wrong!' })
        }
    }

    //get user Details function
    const getUserDetails = async(email, res) => {
        try {
            await regUserCollection.findOne({ email: email })
                .then(result => {
                    if (result) {
                        res.status(200).send({ success: true, data: result, message: 'User Data Found!' });
                    } else res.status(404).send({ success: false, data: null, message: 'No User Data Found!' });
                })
        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'Failed to get data!' });
        }
    }
    const getPatientDetailsById = async(id, res) => {

    }

    //get all doctors list

    const getAllDoctors = async(res) => {
        try {
            await doctorCollection.find().toArray((err, items) => {
                if (items) {
                    res.status(200).send({ success: true, data: items, message: 'doctors data Found!' });
                } else {
                    res.status(404).send({ success: false, data: null, message: 'No Data Found!' });
                }

            })

        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'No Data Found!' });
        }
    }

    //get doctor details information
    const getDoctorDetails = async(email, res) => {
        try {
            await doctorCollection.findOne({ email: email })
                .then(result => {
                    if (result) {
                        res.status(200).send({ success: true, data: result, message: 'Doctor Data Found!' });
                    } else res.status(404).send({ success: false, data: null, message: 'No Doctor Data Found!' });
                })
        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'Failed to get data!' });
        }
    }
    const getDoctorDetailsById = async(id, res) => {
        try {
            await doctorCollection.findOne({ _id: ObjectID(id) })
                .then(result => {
                    if (result) {
                        res.status(200).send({ success: true, data: result, message: 'Doctor Data Found!' });
                    } else res.status(404).send({ success: false, data: null, message: 'No Doctor Data Found!' });
                })
        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'Failed to get data!' });
        }
    }

    //admin login function
    const adminLogin = async(adminDetails, res) => {
        await adminCollection.findOne({ email: adminDetails.email })
            .then(async result => {
                if (result === null) {
                    return res.status(400).send({ success: false, data: null, message: 'No Admin found!' });
                }
                const finalData = {...result };
                finalData.token = adminDetails.token;
                try {
                    if (adminDetails.password === result.password) {
                        return res.status(200).send({ success: true, data: finalData, message: 'Logged In Successfully!' });
                    } else return res.status(404).send({ success: false, data: null, message: 'Password does not matched!' })
                } catch (error) {
                    return res.status(400).send({ success: false, data: null, message: 'Something went wrong!' })
                }

                // if (result && result.password === authData.password) res.send({ success: true, data: result, message: 'Logged In Successfully!' });
                // if (result.password !== authData.password) res.send({ success: false, data: null, message: 'Password does not match!' });
                // else res.send({ success: false, data: null, message: 'No user found!' });
            })
            .catch(err => {
                res.status(500).send({ success: false, data: null, message: err })
                console.log('error found', err);
            });
    }

    //get admin details function
    const getAdminDetails = async(email, res) => {
        try {
            await adminCollection.findOne({ email: email })
                .then(result => {
                    if (result) {
                        res.status(200).send({ success: true, data: result, message: 'Admin Data Found!' });
                    } else res.status(404).send({ success: false, data: null, message: 'No Admin Data Found!' });
                })
        } catch (error) {
            res.status(500).send({ success: false, data: null, message: 'Something went wrong!' })
        }
    }


    //patient login
    const patientLogin = async(authData, res) => {
        await regUserCollection.findOne({ email: authData.email })
            .then(async result => {
                if (result === null) {
                    return res.status(400).send({ success: false, data: null, message: 'No user found!' });
                }
                try {
                    if (await bcrypt.compare(authData.password, result.password)) {
                        // result.token = accessToken;
                        res.send({ success: true, data: result, message: 'Logged In Successfully!' });
                    } else {
                        res.status(403).send({ success: false, data: null, message: 'Password does not match!' });
                    }
                } catch (error) {
                    res.status(400).send({ success: false, data: null, message: 'Something went wrong!' })
                }

                // if (result && result.password === authData.password) res.send({ success: true, data: result, message: 'Logged In Successfully!' });
                // if (result.password !== authData.password) res.send({ success: false, data: null, message: 'Password does not match!' });
                // else res.send({ success: false, data: null, message: 'No user found!' });
            })
            .catch(err => {
                console.log('error found', err);
            });
    }

    //doctor login
    const doctorLogin = async(authData, res) => {
        await doctorCollection.findOne({ email: authData.email })
            .then(async result => {
                if (result === null) {
                    return res.status(400).send({ success: false, data: null, message: 'No Doctor found!' });
                }
                try {
                    if (result.isVerified) {
                        if (await bcrypt.compare(authData.password, result.password)) {
                            // result.token = accessToken;
                            res.send({ success: true, data: result, message: 'Logged In Successfully!' });
                        } else {
                            res.status(403).send({ success: false, data: null, message: 'Password does not match!' });
                        }
                    } else res.status(404).send({ success: false, data: null, message: 'Doctor Does not verified!' })

                } catch (error) {
                    res.status(400).send({ success: false, data: null, message: 'Something went wrong!' })
                }

                // if (result && result.password === authData.password) res.send({ success: true, data: result, message: 'Logged In Successfully!' });
                // if (result.password !== authData.password) res.send({ success: false, data: null, message: 'Password does not match!' });
                // else res.send({ success: false, data: null, message: 'No user found!' });
            })
            .catch(err => {
                console.log('error found', err);
            });
    };

    //patient registration
    const registerPatients = async(authData, res) => {
        try {
            const hashedPassword = await bcrypt.hash(authData.password, 10);
            authData.password = hashedPassword;
            authData.confirmPassword = hashedPassword;
            regUserCollection.findOne({ email: authData.email })
                .then((result) => {
                    if (result === null) {
                        regUserCollection.insertOne(authData)
                            .then(result => {
                                res.status(201).send({ success: true, data: result, message: 'success' });
                            })
                            .catch(err => {
                                res.status(500).send({ success: false, data: null, message: err })
                            });
                    } else {
                        res.status(400).send({ success: false, data: null, message: 'User Already Exist' })
                    }
                })
        } catch (error) {
            res.status(500).send({ success: false, data: null, message: error });
        }
    }

    //doctor registration
    const registerDoctor = async(authData, res) => {
            try {
                const hashedPassword = await bcrypt.hash(authData.password, 10);
                authData.password = hashedPassword;
                authData.confirmPassword = hashedPassword;
                doctorCollection.findOne({ email: authData.email })
                    .then((result) => {
                        if (result === null) {
                            // console.log('data inserted');
                            doctorCollection.insertOne(authData)
                                .then(result => {
                                    res.status(201).send({ success: true, data: result, message: 'success' });
                                })
                                .catch(err => {
                                    res.status(500).send({ success: false, data: null, message: err })
                                });
                        } else {
                            res.status(400).send({ success: false, data: null, message: 'User Already Exist' })
                        }
                    })
            } catch (error) {
                res.status(500).send({ success: false, data: null, message: error });
            }
        }
        // perform actions on the collection object
        // newClient.close();
});



const getAge = (dateString) => {
    const today = new Date();
    const birthDate = new Date(dateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}


const generateAccessToken = (user) => {
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET)

}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token === null) return res.sendStatus(401).send({ success: false, data: null, message: 'Authentication Failed!' });

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) return res.sendStatus(403).send({ success: false, data: null, message: 'Token Invalid!' });
        req.user = user;
        next();
    });
}











// const uri = "mongodb+srv://mahee:mahee123@cluster0.xwkyk.mongodb.net/onlineCourse?retryWrites=true&w=majority";
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xwkyk.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;





// const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, connectTimeoutMS: 30000, keepAlive: 1 });
// client.connect(err => {
//   // const cardsCollection = client.db("onlineCourse").collection("cards");
//   const cardsCollection = client.db(`${process.env.DB_NAME}`).collection("cards");

//   app.post('/addCards', (req, res) => {
//     // console.log("res", req.body);
//     const cards = req.body;
//     console.log(cards);
//     cardsCollection.insertOne(cards)
//       .then(result => {
//         console.log("Successfully love you");
//         res.send(result.insertedCount > 0);
//       })
//   })

// });


app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
})