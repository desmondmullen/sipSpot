import React, { Component } from 'react';
import { Container, Row, Col, Modal, ModalHeader, ModalBody, ModalFooter } from 'reactstrap';
import TEXT from '../../utils/TEXT';
import MenuModal from '../../components/Menu';
import PostDrink from '../../components/PostDrink';
import './Home.css';
import API from "../../utils/API";
import superSpot from '../../images/superSpot.gif';
import AUTH from '../../utils/AUTH';
import { List } from "../../components/List";

class Home extends Component {
  constructor (props) {
    super(props);
    this.state = {
      numberOfDrinks: [ { number: 0, timeOfLastDrink: new Date() } ],
      userPhoneNumber: 0,
      emergencyContactNumber: 0,
      password: '',
      isLoggedIn: false,
      weight: 130,
      gender: 'f',
      selfAlertThreshold: 0.1,
      emergencyAlertThreshold: 0.1,
      latitude: 0,
      longitude: 0,
      theCheckinLatitude: 0,
      theCheckinLongitude: 0,
      proximityAlertSent: false,
      selfAlertSent: false,
      emergencyAlertSent: false,
      watchID: 0,
      bac: 0,
      zero: new Date(),
      interval: "",
      alertsModal: false,
      phoneModal: false,
      settingsModal: false,
      logoutModal: false,
      quickstartModal: false,
      infoModal: false,
      infoModalBody: "",
      modal: false,
      drinks: [],
      addDrinkFlag: 0,
      toggle () {
        this.setState(prevState => ({
          modal: !prevState.modal
        }));
      }
    };
  };

  //Drink history summary
  drinkHistory = () => {
    AUTH.getUserDrinks({
      userPhoneNumber: this.state.userPhoneNumber
    }).then(res => {
      //Begin calculate history summary based on date  
      let dateArr = [];

      for (let i = 0; i < res.data[ 0 ].drinks.length; i++) {
        dateArr.push((new Date(res.data[ 0 ].drinks[ i ].timeOfLastDrink).getMonth() + 1 + "/" +
          new Date(res.data[ 0 ].drinks[ i ].timeOfLastDrink).getDate() + '/' +
          new Date(res.data[ 0 ].drinks[ i ].timeOfLastDrink).getFullYear()));

      }
      //remove duplicates dates
      dateArr.sort(function (a, b) { return a - b });
      let uniqueDate = dateArr.filter(function (item, pos) {
        return dateArr.indexOf(item) === pos;
      });
      dateArr = dateArr.reverse();
      uniqueDate = uniqueDate.reverse();
      //count the nuber of drinks for each day
      let drinkSum = [];
      for (let i = 0; i < uniqueDate.length; i++) {
        let dateOfDrink, count = 0;
        for (let j = 0; j < res.data[ 0 ].drinks.length; j++) {
          if (dateArr[ j ] === uniqueDate[ i ]) {
            count++;
            dateOfDrink = uniqueDate[ i ];
          }
        }
        if (count > 0) {
          drinkSum.push({ dateOfDrink: dateOfDrink, count: count });
        }
      }
      //End of calculate history summary based on date
      this.setState({ drinks: drinkSum });
    })
      .catch(err => console.log(err));
  };

  //grab previous drink info from db
  loadDrinks = (when) => {
    AUTH.getUserDrinks({
      userPhoneNumber: this.state.userPhoneNumber
    }).then(res => {
      clearInterval(this.interval);
      let lastdrink = {};
      let numberOfDrinksCopy = this.state.numberOfDrinks;
      if (res.data[ 0 ].drinks.length > 0) {
        lastdrink.number = res.data[ 0 ].drinks[ (res.data[ 0 ].drinks.length) - 1 ].numberOfDrinks;
        lastdrink.timeOfLastDrink = (new Date(res.data[ 0 ].drinks[ (res.data[ 0 ].drinks.length) - 1 ].timeOfLastDrink));
        numberOfDrinksCopy.push(lastdrink);
      }
      //elapsed time in minutes since last recorded drink
      let now = new Date();
      let elapsedTime = (now - new Date(lastdrink.timeOfLastDrink)) / 60000;
      let bac = 0;
      if (res.data[ 0 ].drinks.length > 0) {
        bac = (res.data[ 0 ].drinks[ (res.data[ 0 ].drinks.length) - 1 ].bac - (elapsedTime * .00025)).toFixed(4);
      }
      if (bac < 0.005) { bac = 0; }
      //measure the time based on current bac for it to get to 0
      let counter = 0, baczero = bac;
      while (baczero >= 0.005) {
        baczero = baczero - ((1 / 60) * .015);
        counter++;
      }
      let zero = (counter / 60).toFixed(2);
      if (bac < 0.005) { zero = 0; }
      //add all db vars to state on mount
      this.setState({
        emergencyContactNumber: res.data[ 0 ].emergencyContactNumber, weight: res.data[ 0 ].weight,
        gender: res.data[ 0 ].gender, selfAlertThreshold: res.data[ 0 ].selfAlertThreshold, emergencyAlertThreshold: res.data[ 0 ].emergencyAlertThreshold,
        numberOfDrinks: numberOfDrinksCopy, bac, zero
      });
      this.interval = setInterval(() => { this.updateBac.bind(this); this.updateBac(); }, 60000);
      if (this.state.addDrinkFlag === 1) {
        this.drinkTracker();
      }
    })
      .catch(err => console.log(err));
  };

  componentDidMount () {
    this._isMounted = true;
    this.checkLocalStorageOnMount();
    this.watchLocation();
  };

  componentWillUnmount () {
    this._isMounted = false;
  };

  calculateBac (drink, time, weight, gender) {
    //calculate BAC(using 130lbs as generic weight and r=0.55 for conservative estimate if user does not give the data)
    let r = 0.55;
    if (gender.toLowerCase === 'm') {
      r = 0.68;
    }
    let bac = ((drink * 14) / ((weight * 453.592) * r)) * 100;
    //elapsed time 
    let first = (Date.parse(time)) / 3600000;
    let now = (Date.parse(new Date())) / 3600000;
    let elapsedTime = now - first;
    bac = (bac - (elapsedTime * 0.015)).toFixed(4);
    return bac;
  };

  //update BAC every minute
  updateBac () {
    let bac = (this.state.bac - ((1 / 60) * .015)).toFixed(4);
    if (bac < 0.005) { bac = 0; }
    //measure the time based on current bac for it to get to 0
    let counter = 0, baczero = bac;
    while (baczero >= 0.005) {
      baczero = baczero - ((1 / 60) * .015);
      counter++;
    }
    let zero = (counter / 60).toFixed(2);
    if (bac < 0.005) { zero = 0; }
    this.setState({ bac, zero });
  };

  drinkTracker = (e) => {
    if (this.state.addDrinkFlag !== 1) {
      e.preventDefault();
    }
    document.activeElement.blur();
    if (this.state.userPhoneNumber !== 0) {
      clearInterval(this.interval);
      let lastdrink = {};
      let numberOfDrinksCopy = this.state.numberOfDrinks;
      lastdrink.number = (numberOfDrinksCopy[ (numberOfDrinksCopy.length - 1) ].number) + 1;
      lastdrink.timeOfLastDrink = new Date();
      numberOfDrinksCopy.push(lastdrink);
      let bac = (parseFloat(this.calculateBac(1, lastdrink.timeOfLastDrink, this.state.weight, this.state.gender)) +
        parseFloat(this.state.bac)).toFixed(4);
      if (bac < 0.005) { bac = 0; }
      //measure the time based on current bac for it to get to 0
      let counter = 0, baczero = bac;
      while (baczero >= 0.005) {
        baczero = baczero - ((1 / 60) * .015);
        counter++;
      }
      let zero = (counter / 60).toFixed(2);
      if (bac < 0.005) { zero = 0; }
      this.setState({ numberOfDrinks: numberOfDrinksCopy, bac, zero, addDrinkFlag: 0 },
        () => this.checkBeforeSendAutomaticText());
      //push drinks to db
      if (this.state.userPhoneNumber !== 0) {
        API.saveDrink({
          userPhoneNumber: this.state.userPhoneNumber,
          numberOfDrinks: lastdrink.number,
          bac: bac,
          timeOfLastDrink: lastdrink.timeOfLastDrink,
          latitude: this.state.theCheckinLatitude,
          longitude: this.state.theCheckinLongitude
        }).then((result) => {
          console.log("drinks added");
        }).catch(err => console.log(err));
      }
      this.interval = setInterval(() => { this.updateBac.bind(this); this.updateBac(); }, 60000);
    } else {
      this.setState({ addDrinkFlag: 1 }, () => { this.checkForNumbers.bind(this); this.checkForNumbers(); })
    }
  };

  checkIn = (e) => {
    e.preventDefault();
    this.checkForNumbers();
    if (this.state.latitude < 1) {
      const theInformation = "Your phone is not reporting your location. Location is required for sipSpot to send you proximity notices. Please check to see if you have location services turned on and try again."
      this.setState(prevState => ({
        infoModal: !prevState.infoModal,
        infoModalBody: theInformation
      }));
      setTimeout(function () {
        try {
          document.getElementById("btn-info").focus()
        }
        catch (err) {
          console.log(err.message);
        }
      }, 500);
    } else {
      this.storeCheckinLocation();
    };
    document.activeElement.blur();
  };

  checkOut = (e) => {
    e.preventDefault();
    this.setState({
      theCheckinLatitude: 0,
      theCheckinLongitude: 0
    });
    document.activeElement.blur();
  };

  checkLocalStorageOnMount = () => {
    if (this.state.userPhoneNumber === 0) {
      let userPhoneNumber = localStorage.getItem("userPhoneNumber");
      let emergencyContactNumber = localStorage.getItem("emergencyContactNumber");
      let isLoggedIn = localStorage.getItem("isLoggedIn");
      if (userPhoneNumber > 0) {
        this.setState({ userPhoneNumber: userPhoneNumber }, () => { this.loadDrinks() });
      }
      if (emergencyContactNumber > 0) {
        this.setState({ emergencyContactNumber: emergencyContactNumber });
      }
      if (isLoggedIn === "true") {
        this.setState({ isLoggedIn: true });
      } else {
        this.setState({ isLoggedIn: false });
      }
    }
  };

  checkForNumbers = (callback) => {
    if (this.state.userPhoneNumber === 0 || this.state.userPhoneNumber === null || this.state.userPhoneNumber === "") {
      this.togglePhone();
    } else {
      this.loadDrinks();
    }
    if (typeof callback === "function") { callback() };
  };

  storeCheckinLocation = () => {
    this.setState({ theCheckinLatitude: this.state.latitude, theCheckinLongitude: this.state.longitude, proximityAlertSent: false, emergencyAlertSent: false }, this.watchLocation);
    document.getElementById("test-display").innerText = "Check-In location: " + this.state.latitude + ", " + this.state.longitude + new Date().getHours() + ":" + new Date().getMinutes() + ":" + new Date().getSeconds();
  };

  watchLocation = () => {
    setTimeout(() => {
      const watchId = navigator.geolocation.watchPosition(this.checkLocation);
      this._isMounted && this.setState({ watchId });
    }, 3000);
  };

  checkLocation = (position) => {
    this._isMounted && this.setState({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    if (this.state.theCheckinLatitude !== 0) {
      let theDifferenceLatitude = (Math.abs(position.coords.latitude - this.state.theCheckinLatitude)).toFixed(6);
      let theDifferenceLongitude = (Math.abs(position.coords.longitude - this.state.theCheckinLongitude)).toFixed(6);
      if (!this.state.proximityAlertSent) {
        if (theDifferenceLatitude > .0004 || theDifferenceLongitude > .0004) {
          document.getElementById("test-display").innerText = "MAJOR PROXIMITY CHANGE " + new Date().getHours() + ":" + new Date().getMinutes() + ":" + new Date().getSeconds();
          this.setState({ proximityAlertSent: true, theCheckinLatitude: 0, theCheckinLongitude: 0 });
          const theMessage = "It looks like you are leaving the spot where you checked in with sipSpot. Don't forget your credit card, jacket, friends, etc.! PLEASE NOTE: proximity alerts are now turned off until you Check-In again.";
          document.getElementById("test-display").innerText = "sending proximity alert to " + this.state.userPhoneNumber;
          this.sendAutomaticTextBasic(this.state.userPhoneNumber, theMessage);
        } else {
          document.getElementById("test-display").innerText = "minor proximity change " + new Date().getHours() + ":" + new Date().getMinutes() + ":" + new Date().getSeconds();
        }
      }
    }
  };

  contactFriends = () => {
    document.activeElement.blur();
    this.checkForNumbers(this.sendText);
  };

  sendText = () => {
    var ua = navigator.userAgent.toLowerCase();
    var isAndroid = ua.indexOf("android") > -1;
    if (isAndroid) {
      // Android phones require a shortened URL because they
      // can't handle the ampersand in the Google Maps link
      const theUrl = `https://www.google.com/maps/dir/?api=1%26destination=${this.state.latitude},${this.state.longitude}`;
      API.shortenUrl({
        URL: theUrl
      }).then((result) => {
        const theMessageString = "sms:;?&body=" + encodeURIComponent("Come meet me out on the town! This link was generated by sipSpot, location is approximate: " + result.data.shorturl);
        window.open(theMessageString, "_self");
        return false;
      }).catch(err => console.log(err));
    } else { // iOS can handle the ampersand without modification
      const theUrl = `https://www.google.com/maps/dir/?api=1&destination=${this.state.latitude},${this.state.longitude}`;
      const theMessageString = "sms:;?&body=" + encodeURIComponent("Come meet me out on the town! This link was generated by sipSpot, location is approximate: " + theUrl);
      window.open(theMessageString, "_self");
      return false;
    }
  };

  checkBeforeSendAutomaticText = () => {
    if (this.state.selfAlertSent === false) {
      if (this.state.bac > this.state.selfAlertThreshold) {
        this.sendAutomaticText('self');
      }
    }
    if (this.state.emergencyAlertSent === false) {
      if (this.state.bac > this.state.emergencyAlertThreshold) {
        this.sendAutomaticText();
      }
    }
  };

  sendAutomaticTextBasic = (toNumber, theMessage) => {
    var ua = navigator.userAgent.toLowerCase();
    var isAndroid = ua.indexOf("android") > -1;
    if (isAndroid && toNumber === this.state.userPhoneNumber) {
      if (theMessage.indexOf("Uber") > -1) { // this removes the Uber link
        theMessage = "It looks like you have had a lot to drink. Please get a ride home or get an Uber, for your own safety and for the safety of others."
      }
      window.navigator.vibrate([ 500, 200, 500 ]);
      setTimeout(function () {
        alert(theMessage);
      }, 800);
      document.getElementById("test-display").innerText = "Alerted message locally: " + theMessage;
    } else {
      TEXT.sendText({ to: toNumber, message: theMessage })
        .then(res => {
          document.getElementById("test-display").innerText = "AUTOMATIC text message sent: " + res.message;
          console.log("AUTOMATIC text message sent, response:");
          console.log(res.message);
        })
        .catch(err => {
          document.getElementById("test-display").innerText = "automatic text sending error: " + err.message;
          console.log(err)
        });
    }
  };

  sendAutomaticText = (self) => {
    if (self === 'self') {
      this.setState({ selfAlertSent: true });
    } else {
      this.setState({ emergencyAlertSent: true });
    }
    let theUrl = `https://www.google.com/maps/dir/?api=1&destination=${this.state.latitude},${this.state.longitude}`;
    let theMessage = `This is an automated message from sipSpot. Your friend at ${this.state.userPhoneNumber} (sipSpot does not track names) entered your number as an emergency contact. Message: Please come give me a ride; I have had too much to drink. Here is a Google Maps link to my location. (This message *auto-generated* by sipSpot, location is approximate) ` + theUrl;
    if (this.state.emergencyContactNumber === this.state.userPhoneNumber || this.state.emergencyContactNumber === 0 || self === 'self') {
      theUrl = "https://m.uber.com/ul/?action=setPickup&pickup=my_location"
      theMessage = "It looks like you have had a lot to drink. Please get a ride home or get an Uber, for your own safety and for the safety of others. Here's a link to Uber: (This message *auto-generated* by sipSpot, location is approximate) " + theUrl;
    }
    let theNumber;
    if (this.state.emergencyContactNumber === 0 || this.state.emergencyContactNumber === null || self === 'self') {
      theNumber = this.state.userPhoneNumber;
    } else {
      theNumber = this.state.emergencyContactNumber;
    }
    console.log(theNumber, theMessage);
    this.sendAutomaticTextBasic(theNumber, theMessage);
  };

  handleInputChange = event => {
    // Getting the value and name of the input which triggered the change
    let value = event.target.value;
    const name = event.target.name;
    // Updating the input's state
    this.setState({
      [ name ]: value.trim()
    });
  };

  handleFormSubmit = event => {
    //toggles off the respective modal
    event.preventDefault();
    if (this.state.settingsModal) {
      if (this.state.weight > 600 || this.state.weight < 65) {
        const theInformation = "Please make sure you have enter the weight in pounds correctly."
        this.setState(prevState => ({
          infoModal: !prevState.infoModal,
          infoModalBody: theInformation
        }));
        setTimeout(function () {
          try {
            document.getElementById("btn-info").focus()
          }
          catch (err) {
            console.log(err.message);
          }
        }, 500);
        return 0;
      }
      this.toggleSettings();
      AUTH.userUpdate({
        userPhoneNumber: this.state.userPhoneNumber,
        emergencyContactNumber: this.state.emergencyContactNumber,
        weight: this.state.weight,
        gender: this.state.gender
      }).then(response => {
        console.log("user info updated");
      });
    }
    if (this.state.phoneModal) {
      //make sure phone number is 10 digits
      let phoneNumberTemp;
      let emergContactNumTemp;
      phoneNumberTemp = (String(this.state.userPhoneNumber).replace(/\./g, '')).replace(/-/g, '');
      console.log("phone num stripped: " + phoneNumberTemp);
      if (phoneNumberTemp.length !== 10 || phoneNumberTemp.charAt(0) === '0' || phoneNumberTemp.charAt(0) === '1') {
        const theInformation = "Your Phone Number must be 10 digits and must not start with 0 or 1. Please enter only your area code and phone number."
        this.setState(prevState => ({
          infoModal: !prevState.infoModal,
          infoModalBody: theInformation
        }));
        setTimeout(function () {
          try {
            document.getElementById("btn-info").focus()
          }
          catch (err) {
            console.log(err.message);
          }
        }, 500);
        return 0;
      } else {
        if (phoneNumberTemp !== this.state.userPhoneNumber) {
          this.setState({
            userPhoneNumber: phoneNumberTemp
          });
        }
      }
      if (String(this.state.emergencyContactNumber).length > 2) { // emergency number is not required
        emergContactNumTemp = (String(this.state.emergencyContactNumber).replace(/\./g, '')).replace(/-/g, '');
        console.log("emerg cont num stripped: " + emergContactNumTemp);
        if (emergContactNumTemp.length !== 10 || emergContactNumTemp.charAt(0) === '0' || emergContactNumTemp.charAt(0) === '1') {
          const theInformation = "Emergency Contact Number must be 10 digits and must not start with 0 or 1. Please enter only your area code and phone number."
          this.setState(prevState => ({
            infoModal: !prevState.infoModal,
            infoModalBody: theInformation
          }));
          setTimeout(function () {
            try {
              document.getElementById("btn-info").focus()
            }
            catch (err) {
              console.log(err.message);
            }
          }, 500);
          return 0;
        } else {
          if (emergContactNumTemp !== this.state.emergencyContactNumber) {
            this.setState({
              emergencyContactNumber: emergContactNumTemp
            });
          }
        }
      } else { // if it's not a real number then user phone number gets emergency texts.
        this.setState({
          emergencyContactNumber: this.state.userPhoneNumber
        });
      }
      if (this.state.password.length < 4 || this.state.password.length > 10 || this.state.password.indexOf(" ") > -1) {
        const theInformation = "Password must be between 4 and 10 characters with no spaces. Please try again."
        this.setState(prevState => ({
          infoModal: !prevState.infoModal,
          infoModalBody: theInformation
        }));
        setTimeout(function () {
          try {
            document.getElementById("btn-info").focus()
          }
          catch (err) {
            console.log(err.message);
          }
        }, 500);
        return 0;
      }
      let userPhoneNumber = this.state.userPhoneNumber;
      if (phoneNumberTemp !== this.state.userPhoneNumber) { // in case state not updated yet
        userPhoneNumber = phoneNumberTemp;
      }
      let emergencyContactNumber = this.state.emergencyContactNumber;
      if (emergContactNumTemp !== this.state.emergencyContactNumber && emergContactNumTemp > 0) { // in case state not updated yet
        emergencyContactNumber = emergContactNumTemp;
      } else {
        emergencyContactNumber = this.state.userPhoneNumber;
      }
      AUTH.signup({
        userPhoneNumber: userPhoneNumber,
        emergencyContactNumber: emergencyContactNumber,
        password: this.state.password
      }).then(response => {
        if (response.data.error !== 'Password does not match') {
          this.setState({
            isLoggedIn: true
          });
          localStorage.setItem("userPhoneNumber", this.state.userPhoneNumber);
          localStorage.setItem("emergencyContactNumber", this.state.emergencyContactNumber);
          localStorage.setItem("isLoggedIn", true);
        }
        if (response.data.error !== 'Phone number exists' && response.data.error !== 'Password does not match') {
          if (this.state.addDrinkFlag === 1) {
            this.drinkTracker();
          } else {
            this.setState({
              redirectTo: '/'
            });
          }
        } else if (response.data.error === 'Phone number exists') {
          this.loadDrinks('on login');
        } else if (response.data.error === 'Password does not match') {
          const theInformation = "Password does not match. Please enter the correct password."
          this.setState(prevState => ({
            infoModal: !prevState.infoModal,
            infoModalBody: theInformation
          }));
          setTimeout(function () {
            try {
              document.getElementById("btn-info").focus()
            }
            catch (err) {
              console.log(err.message);
            }
          }, 500);
          this.setState({ userPhoneNumber: 0, emergencyContactNumber: 0 });
          localStorage.clear();
        }
      });
      this.togglePhone();
    }
    if (this.state.alertsModal) {
      //make sure anything over .1 BAC alert is intentional
      if (this.state.selfAlertThreshold > .1 || this.state.emergencyAlertThreshold > .1) {
        const theInformation = "Please note: 0.08 is legally intoxicated in most places and 0.1 is even more intoxicated. You have set your alert threshold over 0.1. If you don't really want to set your alert threshold so high, please change it in the Alerts dialog box."
        this.setState(prevState => ({
          infoModal: !prevState.infoModal,
          infoModalBody: theInformation
        }));
        setTimeout(function () {
          try {
            document.getElementById("btn-info").focus()
          }
          catch (err) {
            console.log(err.message);
          }
        }, 500);
        return 0;
      }
      this.toggleAlerts();
      AUTH.userUpdate({
        userPhoneNumber: this.state.userPhoneNumber,
        selfAlertThreshold: this.state.selfAlertThreshold,
        emergencyAlertThreshold: this.state.emergencyAlertThreshold,
      }).then(response => {
        console.log("user info updated");
      });
    }
    if (this.state.historyModal) {
      this.toggleHistory();
    }
  };

  changePhoneNotification = () => {
    const theInformation = "The only way to change your phone number is to Logout and then start fresh. If you do so, you will lose any drink history and settings you may have saved. For most people this is not a big deal; it is the only way to change your phone number."
    this.setState(prevState => ({
      infoModal: !prevState.infoModal,
      infoModalBody: theInformation
    }));
    setTimeout(function () {
      try {
        document.getElementById("btn-info").focus()
      }
      catch (err) {
        console.log(err.message);
      }
    }, 500);
  };

  toggleAlerts = () => {
    this.setState(prevState => ({
      alertsModal: !prevState.alertsModal,
      modal: false
    }));
    setTimeout(function () {
      try {
        document.getElementById("btn-alerts").focus()
      }
      catch (err) {
        console.log(err.message);
      }
    }, 500);
  }

  toggleHistory = () => {
    this.drinkHistory();
    this.setState(prevState => ({
      historyModal: !prevState.historyModal,
      modal: false
    }));
    setTimeout(function () {
      try {
        document.getElementById("btn-history").focus()
      }
      catch (err) {
        console.log(err.message);
      }
    }, 500);
  }

  toggleSettings = () => {
    this.setState(prevState => ({
      settingsModal: !prevState.settingsModal,
      modal: false
    }));
    setTimeout(function () {
      try {
        document.getElementById("btn-settings").focus()
      }
      catch (err) {
        console.log(err.message);
      }
    }, 500);
  }

  togglePhone = () => {
    if (this.state.phoneModal === false) {
      this.setState({ // close menu modal
        modal: false
      });
    }
    this.setState(prevState => ({
      phoneModal: !prevState.phoneModal,
    }))
    setTimeout(function () {
      try {
        document.getElementById("btn-phone").focus()
      }
      catch (err) {
        console.log(err.message);
      }
    }, 500);
  };

  toggleQuickstart = () => {
    document.activeElement.blur();
    this.setState(prevState => ({
      quickstartModal: !prevState.quickstartModal
    }))
    setTimeout(function () {
      try {
        document.getElementById("btn-quickstart").focus()
      }
      catch (err) {
        console.log(err.message);
      }
    }, 500);
  };

  toggleInfoModal = () => {
    this.setState(prevState => ({
      infoModal: !prevState.infoModal
    }))
    setTimeout(function () {
      try {
        document.getElementById("btn-info").focus()
      }
      catch (err) {
        console.log(err.message);
      }
    }, 500);
  };

  toggleLogout = () => { // doesn't really toggle, just logs out
    this.handleLogout();
    if (this.state.modal === true) {
      this.setState({ // close menu modal
        modal: false
      });
    }
  }

  handleLogout = () => {
    this.clearLocalStorage();
    this.resetState();
  }

  clearLocalStorage = () => {
    localStorage.setItem("userPhoneNumber", "");
    localStorage.setItem("emergencyContactNumber", "");
    localStorage.setItem("isLoggedIn", false);
  }

  resetState = () => {
    this.setState({
      numberOfDrinks: [ { number: 0, timeOfLastDrink: new Date() } ],
      userPhoneNumber: 0,
      emergencyContactNumber: 0,
      password: '',
      isLoggedIn: false,
      weight: 130,
      gender: 'f',
      selfAlertThreshold: 0.1,
      emergencyAlertThreshold: 0.1,
      latitude: 0,
      longitude: 0,
      theCheckinLatitude: 0,
      theCheckinLongitude: 0,
      proximityAlertSent: false,
      selfAlertSent: false,
      emergencyAlertSent: false,
      watchID: 0,
      bac: 0,
      zero: new Date(),
      interval: "",
      alertsModal: false,
      phoneModal: false,
      settingsModal: false,
      logoutModal: false,
      quickstartModal: false,
      infoModal: false,
      infoModalBody: "",
      modal: false,
      drinks: [],
      addDrinkFlag: 0
    })
  };

  render () {
    return (
      <div>
        <div className="topbar">
          <MenuModal user={ this.state.firstName } modal={ this.state.modal } toggle={ this.state.toggle.bind(this) }
            toggleAlerts={ this.toggleAlerts } toggleHistory={ this.toggleHistory } toggleSettings={ this.toggleSettings } togglePhone={ this.togglePhone }>
          </MenuModal>
          <button className="cntrl-btn" data-test="menu-quickstart" onClick={ this.toggleQuickstart }>Quick Start</button>
        </div>
        <Container className="home">
          <MenuModal isLoggedIn={ this.state.isLoggedIn } user={ this.state.firstName } modal={ this.state.modal } toggle={ this.state.toggle.bind(this) }
            toggleAlerts={ this.toggleAlerts } toggleHistory={ this.toggleHistory } toggleSettings={ this.toggleSettings } toggleLogout={ this.toggleLogout } togglePhone={ this.togglePhone }>
          </MenuModal>
          <Row>
            <Col>
              <div id="title">sipSpot</div>
            </Col>
          </Row>
          <Row >
            <Col>
              <div id="test-display">test display</div>
              <PostDrink drinks={ this.state.numberOfDrinks[ ((this.state.numberOfDrinks).length) - 1 ] } bac={ this.state.bac }
                zero={ this.state.zero } modal={ this.state.modal } toggle={ this.state.toggle.bind(this) }
                toggleHistory={ this.toggleHistory } >
              </PostDrink>
              <div>
                <img id="superSip" src={ superSpot } alt="super sip the beer bottle" width="40%" />
              </div>
            </Col>
          </Row>
        </Container>
        <div className="bottombar">
          { this.state.theCheckinLatitude === 0 ? (
            <button className="cntrl-btn" data-test="controls-checkin" onClick={ this.checkIn }>CheckIn</button>
          ) : (
              <button className="cntrl-btn" data-test="controls-checkin" onClick={ this.checkOut }>ChkOut</button>
            ) }
          <button className="cntrl-btn" data-test="controls-drink" onClick={ this.drinkTracker }>+Drink</button>
          <a id="uber-button" className="cntrl-btn" data-test="controls-uber" href="https://m.uber.com/ul/?action=setPickup&pickup=my_location" target="_blank" rel="noopener noreferrer">Uber</a>
          <button id="friends-button" className="cntrl-btn" data-test="controls-friends" onClick={ this.contactFriends }>Friends</button>
        </div>
        {/* Alerts Modal */ }
        <Modal isOpen={ this.state.alertsModal } toggleAlerts={ this.toggleAlerts } className="alerts">
          <ModalHeader toggle={ this.toggleAlerts }>
          </ModalHeader>
          <ModalBody className="modal-body">
            <Container>
              <p className="modal-text modal-text-shadow">Alerts: Set alert thresholds to remind yourself or to alert a friend if your BAC goes above the level you choose. Perhaps you want to remind yourself if your BAC gets up to 0.07 and you want to tell a friend if it gets up to 0.09. Alerts are sent to your phone or your friend's phone as text messages.</p>
              <form onSubmit={ this.handleFormSubmit }>
                <div className="form-group">
                  <label className="form-check-label alerts-label modal-text modal-text-shadow">BAC Emergency Alert Threshold *0.08 is intoxicated, 0.1 is more intoxicated</label>
                  <input
                    onChange={ this.handleInputChange }
                    value={ this.state.emergencyAlertThreshold }
                    name="emergencyAlertThreshold"
                    type="number" step="0.01"
                    className="form-control" id="settings-bac-threshold" placeholder="Ex. .08"></input>
                </div>
                <div className="form-group">
                  <label className="alerts-label modal-text modal-text-shadow">BAC Self Alert Threshold *0.08 is intoxicated, 0.1 is more intoxicated</label>
                  <input
                    onChange={ this.handleInputChange }
                    value={ this.state.selfAlertThreshold }
                    name="selfAlertThreshold"
                    type="number" step="0.01"
                    className="form-control" id="drinkCountThreshold" placeholder="Ex. 5"></input>
                </div>
                <div className="button-container">
                  <button id="btn-alerts" type="submit" className="btn btn-style">Submit</button>
                </div>
              </form>
            </Container>
          </ModalBody>
          <ModalFooter>
          </ModalFooter>
        </Modal>
        {/* History Modal */ }
        <Modal isOpen={ this.state.historyModal } toggleSettings={ this.toggleHistory } className="history">
          <ModalHeader toggle={ this.toggleHistory }>
          </ModalHeader>
          <ModalBody className="modal-body">
            <Container>
              <p className="modal-text modal-text-shadow">History: The number of drinks you added using the "+Drink" button per day.</p>
              { this.state.drinks.length ? (
                <List>
                  <table>
                    <tr>
                      <th>Date</th>
                      <th>Number of Drinks</th>
                    </tr>
                    { this.state.drinks.map((drink, index) => (
                      <tr key={ index }>
                        <td>{ drink.dateOfDrink }</td>
                        <td>{ drink.count }</td>
                      </tr>
                    )) }
                  </table>
                </List>
              ) : (
                  <p className="modal-text modal-text-shadow">No drink history to display.</p>
                ) }
              <button id="btn-history" type="" className="btn btn-style" onClick={ this.toggleHistory }>OK</button>
            </Container>
          </ModalBody>
        </Modal>
        {/* Settings Modal */ }
        <Modal isOpen={ this.state.settingsModal } toggleSettings={ this.toggleSettings } className="settings">
          <ModalHeader toggle={ this.toggleSettings }>
          </ModalHeader>
          <ModalBody className="modal-body">
            <Container>
              <p className="modal-text">Settings: Enter your weight and gender below to more-accurately calculate Blood Alcohol Concentration (BAC). You can also optionally change your emergency contact number and password here.</p>
              <form onSubmit={ this.handleFormSubmit }>
                <div className="form-group">
                  <label className="form-check-label settings-label modal-text modal-text-shadow" for="settings-weight">Weight in pounds (for BAC calculations):</label>
                  <input type="number"
                    onChange={ this.handleInputChange }
                    value={ this.state.weight }
                    name="weight"
                    className="form-control" id="settings-weight" placeholder="Ex. 130"></input>
                </div>
                <div className="form-group">
                  <label className="settings-label modal-text modal-text-shadow">Gender (for BAC calculations):</label>
                  <div className="form-group gender-selector">
                    <div className="form-check form-check-inline">
                      <input className="form-check-input modal-text gender-radio-btn"
                        onChange={ this.handleInputChange }
                        name="gender"
                        type="radio" id="inputeGenderMale" value="m" checked={ this.state.gender === "m" }></input>
                      <label className="form-check-label settings-label modal-text modal-text-shadow" for="inlineCheckbox1">Male</label>
                    </div>
                    <div className="form-check form-check-inline">
                      <input className="form-check-input modal-text gender-radio-btn"
                        onChange={ this.handleInputChange }
                        name="gender"
                        type="radio" id="inputGenderFemale" value="f" checked={ this.state.gender === "f" }></input>
                      <label className="form-check-label settings-label modal-text modal-text-shadow" for="inlineCheckbox2">Female</label>
                    </div>
                  </div>
                </div><div className="form-group">
                  <label className="form-check-label settings-label modal-text modal-text-shadow" for="settings-user-phone-number">Phone Number:</label>
                  <input
                    value=""
                    type="number"
                    name="userPhoneNumber"
                    onClick={ this.changePhoneNotification }
                    className="form-control" id="settings-user-phone-number" placeholder={ this.state.userPhoneNumber }></input>
                </div>
                <div className="form-group">
                  <label className="form-check-label settings-label modal-text modal-text-shadow" for="emergencyContactPhoneNumber">Emergency Contact Number:</label>
                  <input type="number"
                    value={ this.state.emergencyContactNumber < 1 ? "" : this.state.emergencyContactNumber }
                    onChange={ this.handleInputChange }
                    name="emergencyContactNumber"
                    className="form-control" id="emergencyContactPhoneNumber" placeholder=""></input>
                </div>
                <div className="button-container">
                  <button id="btn-settings" type="submit" className="btn btn-style">Submit</button>
                </div>
              </form>
            </Container>
          </ModalBody >
          <ModalFooter>
          </ModalFooter>
        </Modal>
        {/* Phone Modal */ }
        <Modal isOpen={ this.state.phoneModal } togglePhone={ this.togglePhone } className="settings">
          <ModalHeader toggle={ this.togglePhone }>
          </ModalHeader>
          <ModalBody className="modal-body">
            <Container>
              <p className="modal-text">Spot just needs two or three bits of info to help you. Your phone number so he can send you alerts (required). An optional emergency contact number so he can send that person directions to your location if you're overdoing it. And a password so he can keep your information private (required).</p>
              <form onSubmit={ this.handleFormSubmit }>
                <div className="form-group">
                  <label className="form-check-label settings-label modal-text" for="settings-user-phone-number">Phone Number:</label>
                  <input
                    value={ this.state.userPhoneNumber === 0 ? "" : this.state.userPhoneNumber }
                    onChange={ this.handleInputChange }
                    type="number"
                    name="userPhoneNumber"
                    className="form-control" id="settings-user-phone-number" placeholder="9195551212"></input><br />
                  <label className="form-check-label settings-label modal-text" for="settings-emergency-contact-number">Emergency Contact Number (optional):</label>
                  <input
                    value={ this.state.emergencyContactNumber === 0 ? "" : this.state.emergencyContactNumber }
                    onChange={ this.handleInputChange }
                    type="number"
                    name="emergencyContactNumber"
                    className="form-control" id="settings-emergency-contact-number" placeholder="9195551212"></input><br />
                  <label className="form-check-label settings-label modal-text" for="settings-password">Password (at least 4 characters):</label>
                  <input
                    value={ this.state.password }
                    onChange={ this.handleInputChange }
                    type="text"
                    name="password"
                    className="form-control" id="settings-password" placeholder=""></input>
                </div>
                <div className="button-container">
                  <button id="btn-phone" type="submit" className="btn btn-style">Submit</button>
                </div>
              </form>
            </Container>
          </ModalBody>
        </Modal>
        {/* Quickstart Modal */ }
        <Modal isOpen={ this.state.quickstartModal } toggleQuickstart={ this.toggleQuickstart } className="settings">
          <ModalHeader toggle={ this.toggleQuickstart }>
          </ModalHeader>
          <ModalBody className="modal-body">
            <Container>
              <ul id="how-to" className="modal-text modal-text-shadow">
                <li>Click <em><strong>CheckIn</strong></em> to keep track of where your stuff is (your credit card on a bar tab, your jacket, your friends). sipSpot uses GPS to note where you are when you Check In and then let you know if it looks like you're leaving the area. For some of us this is a great way to make sure we don't forget things!</li>
                <li>Click <em><strong>+Drink</strong></em> each time you get a drink. sipSpot will keep track of your drinks over time to give you a rough estimate of your BAC*. sipSpot constantly updates your estimated BAC and hours-back-to-zero. Please remember that these numbers are only <strong>rough estimates</strong>.</li>
                <li>Click <em><strong>Uber</strong></em> to get a safe ride home.</li>
                <li>Click <em><strong>Friends</strong></em> to send friends a link to your location. Invite them out to join you, or ask them for a ride!</li>
                <li>Click <em><strong>Menu</strong></em> at the top left to change thresholds for Alerts, to view History, or to change your Settings.</li>
              </ul>
              <p className="modal-text modal-text-shadow">*BAC stands for "Blood Alcohol Concentration". Properly calculating BAC requires a complicated equation and depends on accurate measures of a person's alcohol intake along with their weight and gender. While <em>sipSpot</em> can provide a more accurate BAC number if you enter your weight and gender in <em><strong>Settings</strong></em>, this number will always be a rough estimate. Please use the BAC readings in <em>sipSpot</em> as a <em>general guidance</em>. If in doubt, please call a friend for a ride or get an Uber.</p>
              <div className="button-container">
                <button id="btn-quickstart" type="" className="btn btn-style" onClick={ this.toggleQuickstart }>OK</button>
              </div>
            </Container>
          </ModalBody>
        </Modal>
        {/* Info Modal */ }
        <Modal isOpen={ this.state.infoModal } toggleInfoModal={ this.toggleInfoModal } className="settings">
          <ModalHeader toggle={ this.toggleInfoModal }>
          </ModalHeader>
          <ModalBody className="modal-body">
            <Container>
              <p className="modal-text">{ this.state.infoModalBody }</p>
              <div className="button-container">
                <button id="btn-info" type="" className="btn btn-style" onClick={ this.toggleInfoModal }>OK</button>
              </div>
            </Container>
          </ModalBody>
        </Modal>
      </div>
    );
  }
};

export default Home;