'use strict';

var Service;
var Characteristic;

var broadcast = '000000000000000009000000e00729070b00170a00000000c0a80a0555c100008ec20000000006000000000000000000';
var dgram = require('dgram');


module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('homebridge-blauberg-vento', 'BlaubergVento', UdpMultiswitch);
};

function UdpMultiswitch(log, config) {
    this.log = log;

    this.name            = config.name || 'Blauberg Vento';
    this.host            = config.host;
    this.port            = config.port || 4000;
    this.serialNumber    = config.serialNumber || '';


    this.currentActiveStatus  = null;
}

UdpMultiswitch.prototype = {

    udpRequest: function(host, port, payloadMessage, callback, callbackResponse) {
        if(!callback){callback = function(){};}
        if(!callbackResponse){callbackResponse = function(){};}

        var client = dgram.createSocket('udp4');
        var delayTime = Math.floor(Math.random() * 1500) + 1;
        var message = new Buffer(payloadMessage, 'hex');

        setTimeout(function() { 
            client.send(broadcast, 0, broadcast.length, port, host, function(err, bytes) {
                if (err) throw err;

                client.send(message, 0, message.length, port, host, function(err, bytes) {
                    if (err) throw err;
                    
                    console.log('UDP message sent to ' + host +':'+ port, message);

                    client.on('message', function(msg, rinfo){
                        console.log('UDP message get', msg);
                        callbackResponse(msg, rinfo);
                        client.close();
                    });
            
                    callback(err);
                });
                
            });
        }, delayTime);

    },

    _parseResponseBuffer: function(data){
        return JSON.parse(JSON.stringify(data)).data;
    },

    getFilterStatus: function (targetService, callback, context) {
        var that = this;
        var payload = '6D6F62696C65' + '01' + '01' + '0D0A';

        this.udpRequest(this.host, this.port, payload, function (error) {
            if(error) {
                that.log.error('getFilterStatus failed: ' + error.message);
            }
        }, function (msg, rinfo) {
            msg = that._parseResponseBuffer(msg);
            that.currentActiveStatus = msg[7];

            that.log.info('getFilterStatus success: ', msg[31]);
            callback(null, msg[31]);
        });
    },


    getCustomSpeed: function (targetService, callback, context) {
        var that = this;
        var payload = '6D6F62696C65' + '01' + '01' + '0D0A';

        this.udpRequest(this.host, this.port, payload, function (error) {
            if(error) {
                that.log.error('getCustomSpeed failed: ' + error.message);
            }
        }, function (msg, rinfo) {
            msg = that._parseResponseBuffer(msg);
            that.currentActiveStatus = msg[7];

            var speed = msg[21];
            speed = Math.round(speed/255*100);

            that.log.info('getCustomSpeed success: ', speed);
            callback(null, speed);
        });
    },

    setCustomSpeed: function(targetService, speed, callback, context) {      
        var payload = '6D6F62696C65'+'05'+(Math.round(255/100*speed).toString(16))+'0D0A'

        this.udpRequest(this.host, this.port, payload, function(error) {
            if (error) {
                this.log.error('setCustomSpeed failed: ' + error.message);
                this.log('response: ' + response + '\nbody: ' + responseBody);
            
                callback(error);
            } else {
                this.log.info('set speed ' + speed);
            }
            callback();
        }.bind(this));
    },

    getPowerState: function (targetService, callback, context) {
        var that = this;
        var payload = '6D6F62696C65' + '01' + '01' + '0D0A';

        this.udpRequest(this.host, this.port, payload, function (error) {
            if(error) {
                that.log.error('getPowerState failed: ' + error.message);
            }
        }, function (msg, rinfo) {
            msg = that._parseResponseBuffer(msg);
            that.log.info('getPowerState success: ', msg[7]);
            that.currentActiveStatus = msg[7];
            callback(null, msg[7]);
        });
    },

    setPowerState: function(targetService, powerState, callback, context) { 
        var that = this;
        var payload = '6D6F62696C65'+'03'+'00'+'0D0A';

        if(powerState == that.currentActiveStatus){//workaround, blauberg can't on/off device, only toggle  
            callback();
        }else{
            this.udpRequest(this.host, this.port, payload, function(error) {
                if (error) {
                    this.log.error('setPowerState failed: ' + error.message);            
                    callback(error);
                } else {
                    that.currentActiveStatus = powerState;
                    this.log.info('setPowerState ' + powerState);
                }
                callback();
            }.bind(this));
        }
    },

    getFanState: function (targetService, callback, context) {
        var that = this;
        var payload = '6D6F62696C65' + '01' + '01' + '0D0A';

        this.udpRequest(this.host, this.port, payload, function (error) {
            if(error) {
                that.log.error('getFanState failed: ' + error.message);
            }
        }, function (msg, rinfo) {
            msg = that._parseResponseBuffer(msg);
            that.currentActiveStatus = msg[7];

            that.log.info('getFanState success: ', msg[23]);
            
            callback(null,  msg[23]);
        });
    },

    setFanState: function(targetService, fanState, callback, context) { 
        var that = this;

        if(1 == fanState){
            var comand = '01';
        }else if(0 == fanState){
            var comand = '00';
        }

        var payload = '6D6F62696C65'+'06'+comand+'0D0A';

        this.udpRequest(this.host, this.port, payload, function(error) {
            if (error) {
                this.log.error('setFanState failed: ' + error.message);            
                callback(error);
            } else {
                this.log.info('setFanState ' + fanState);
            }
            callback();
        }.bind(this));
        
    },

    getServices: function () {
        this.services = [];

        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Blauberg')
            .setCharacteristic(Characteristic.Model, 'Vento Expert')
            .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
        ;
        this.services.push(informationService);


        var fanService = new Service.Fanv2(this.name);
        fanService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getPowerState.bind(this, fanService))
            .on('set', this.setPowerState.bind(this, fanService))
        ;
        fanService
            .getCharacteristic(Characteristic.RotationSpeed)
            .on('get', this.getCustomSpeed.bind(this, fanService))
            .on('set', this.setCustomSpeed.bind(this, fanService))
        ;
        fanService
            .getCharacteristic(Characteristic.FilterChangeIndication)
            .on('get', this.getFilterStatus.bind(this, fanService))
        ;
        fanService
            .getCharacteristic(Characteristic.TargetFanState)
            .on('get', this.getFanState.bind(this, fanService))
            .on('set', this.setFanState.bind(this, fanService))
        ;

        this.services.push(fanService);
     
        
        return this.services;
    }
};
