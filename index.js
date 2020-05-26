const request = require("request");
const get = require("lodash.get");
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const { USER_TOKEN, TG_TOKEN, MY_ID } = require("./config.json");
const ENTRADAID = 0;
const SALIDAID = 1;
const PARADA = 2;
const VUELTA = 3;
const bot = new TelegramBot(TG_TOKEN, { polling: true });

const changesAvailable = {
  0: [1, 2],
  1: [0],
  2: [3],
  3: [1, 2]
};

const registroHorario = action => {
  return new Promise((resolve, reject) => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    const date = `${year.toString()}-${mm}-${dd}`;
    const hours = new Date()
      .toTimeString()
      .replace(/.*(\d{2}:\d{2}:\d{2}).*/, "$1");

    const holidaysdata = fs.readFileSync("./holidays.json", "utf8");
    const SKIPREGISTERDATES = JSON.parse(holidaysdata).dias;

    if (SKIPREGISTERDATES.indexOf(date) !== -1) {
      resolve("Vacaciones!");
    } else {
      request(
        {
          method: "POST",
          uri: "https://newapi.intratime.es/api/user/clocking",
          headers: {
            Accept: "application/vnd.apiintratime.v1+json",
            "Content-type":
              "multipart/form-data; application/x-www-form-urlencoded; charset:utf8",
            token: USER_TOKEN
          },
          formData: {
            user_action: action,
            user_timestamp: `${date} ${hours}`,
            user_gps_coordinates: "40.437584,-3.625048",
            user_project: "",
            user_file: "",
            user_expense: "12632",
            inout_device_uid: "",
            user_use_server_time: "true",
            expense_amount: "0"
          }
        },
        (error, response, body) => {
          const codigorespuesta = response && response.statusCode;
          let mensaje = "";
          if (codigorespuesta === 201) {
            const accion = ["entrada", "salida", "parada", "vuelta de la parada"];
            mensaje = `Has picado la ${accion[action]}. Código de la respuesta: ${codigorespuesta}.`;
            resolve(mensaje);
          } else {
            try {
              const { message } = JSON.parse(body);
              mensaje = `Status code: ${codigorespuesta}\nMensaje de error: ${message}\nError: ${error}`;
              reject(mensaje);
            } catch (error) {
              reject(error);
            }
          }
        }
      );
    }
  });
};

const getDaysAgo = days => {
  const date = new Date();
  const last = new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
  const day = last.getDate();
  const month = last.getMonth() + 1;
  const year = last.getFullYear();

  return `${year}-${month}-${day}`;
};

const obtenerEstado = () => {
  return new Promise((resolve, reject) => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    const date = `${year.toString()}-${mm}-${dd}`;
    const fromDate = getDaysAgo(7);

    request(
      {
        method: "GET",
        uri: "https://newapi.intratime.es/api/user/clockings",
        headers: {
          Accept: "application/vnd.apiintratime.v1+json",
          "Content-type": "application/x-www-form-urlencoded; charset:utf8",
          token: USER_TOKEN
        },
        qs: {
          last: "true",
          maxResult: "1",
          from: `${fromDate} 00:00:00`,
          to: `${date} 24:00:00`,
          type: "0,1,2,3"
        }
      },
      (error, response, body) => {
        const codigorespuesta = response && response.statusCode;
        let mensaje = "";
        if (codigorespuesta === 200) {
          const accion = ["dentro", "fuera", "descansando", "dentro"];
          const statusdata = JSON.parse(body)[0];
          mensaje = `Tu estado actual es que estás ${accion[
            statusdata && statusdata.INOUT_TYPE
          ] ||
            "fuera"} del trabajo. Código de la respuesta: ${codigorespuesta}.`;
          resolve({
            mensaje,
            code: parseInt(get(statusdata, "INOUT_TYPE", 1), 10)
          });
        } else {
          try {
            const { message } = JSON.parse(body);
            mensaje = `Status code: ${codigorespuesta}\nMensaje de error: ${message}\nError: ${error}`;
            reject(mensaje);
          } catch (error) {
            reject(error);
          }
        }
      }
    );
  });
};

const picarAccion = (accion) => {
  obtenerEstado()
    .then(res => {
      if (changesAvailable[res.code].indexOf(accion) !== -1) {
        registroHorario(accion)
          .then(res => {
            sendMeMessage(res);
          })
          .catch(error => {
            sendMeMessage(error);
          });
      } else {
        sendMeMessage(`No puedes ejecutar esta acción. ${res.mensaje}`);
      }
    })
    .catch(error => {
      sendMeMessage(error);
    });
};

const formatDate = (date) => {
  const d = new Date(date);
  let month = `${d.getMonth() + 1}`;
  let day = `${d.getDate()}`;
  const year = d.getFullYear();

  if (month.length < 2) { month = `0${month}`; }
  if (day.length < 2) { day = `0${day}`; }

  return [year, month, day].join('-');
}

const isValidDate = (dateString) => {
  var regEx = /^\d{4}-\d{2}-\d{2}$/;
  if(!dateString.match(regEx)) return false;  // Invalid format
  var d = new Date(dateString);
  var dNum = d.getTime();
  if(!dNum && dNum !== 0) return false; // NaN value, Invalid date
  return d.toISOString().slice(0,10) === dateString;
}

const addHoliday = (date) => {
  const data = JSON.parse(fs.readFileSync("./holidays.json", "utf8"));
  const holidays = get(data, 'dias', []);
  let check = new Date();
  if (date && isValidDate(date)) {
    check = date
  } else if (!date) {
    check.setDate(check.getDate() + 1);
  } else {
    return 'Fecha invalida'
  }

  const tomorrow = formatDate(check);

  if (holidays.indexOf(tomorrow) === -1) {
    holidays.push(tomorrow)
    const file = {
      dias: holidays
    }
    try {
      fs.writeFileSync("./holidays.json", JSON.stringify(file, null, 2));
      return `Se ha insertado con exito la fecha ${tomorrow}`;
    } catch (e) {
      return "Error al insertar: " + e;
    }
  } else {
    return 'Esta fecha ya se encuentra en el fichero'
  }
}

bot.onText(/\/addholiday (.*)/, (msg, match) => {
  if (msg.chat.id !== MY_ID) return;
  const respuesta = match[1] ? addHoliday(match[1]) : addHoliday();
  sendMeMessage(respuesta);
});

bot.onText(/\/obtenerestado/, (msg, match) => {
  if (msg.chat.id !== MY_ID) return;
  obtenerEstado().then(res => {
    sendMeMessage(res.mensaje);
  });
});

bot.onText(/\/start/, (msg, match) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Este bot no va a funcionar");
});

bot.onText(/\/entrar/, (msg, match) => {
  if (msg.chat.id !== MY_ID) return;
  picarAccion(ENTRADAID);
});

bot.onText(/\/salir/, (msg, match) => {
  if (msg.chat.id !== MY_ID) return;
  picarAccion(SALIDAID);
});

bot.onText(/\/pausa/, (msg, match) => {
  if (msg.chat.id !== MY_ID) return;
  picarAccion(PARADA);
});

bot.onText(/\/vuelta/, (msg, match) => {
  if (msg.chat.id !== MY_ID) return;
  picarAccion(VUELTA);
});

cron.schedule("0 8 * * 1-5", () => {
  picarAccion(ENTRADAID);
});

cron.schedule("0 17 * * 1-5", () => {
  picarAccion(SALIDAID);
});

cron.schedule("0 13 * * 1-5", () => {
  picarAccion(PARADA);
});

cron.schedule("0 14 * * 1-5", () => {
  picarAccion(VUELTA);
});

const sendMeMessage = text => {
  bot.sendMessage(MY_ID, text);
};
