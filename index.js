const request = require("request");
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
    }

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
          user_expense: "2384",
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
  });
};

const obtenerEstado = () => {
  return new Promise((resolve, reject) => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    const date = `${year.toString()}-${mm}-${dd}`;

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
          from: `${date} 00:00:00`,
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
          resolve({ mensaje, code: parseInt(statusdata.INOUT_TYPE, 10) });
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

const picarEntrada = () => {
  obtenerEstado()
    .then(res => {
      if (changesAvailable[res.code].indexOf(ENTRADAID) !== -1) {
        registroHorario(ENTRADAID)
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

const picarSalida = () => {
  obtenerEstado()
    .then(res => {
      if (changesAvailable[res.code].indexOf(SALIDAID) !== -1) {
        registroHorario(SALIDAID)
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

const picarParada = () => {
  obtenerEstado()
    .then(res => {
      if (changesAvailable[res.code].indexOf(PARADA) !== -1) {
        registroHorario(PARADA)
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

const picarVuelta = () => {
  obtenerEstado()
    .then(res => {
      if (changesAvailable[res.code].indexOf(VUELTA) !== -1) {
        registroHorario(VUELTA)
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
  picarEntrada();
});

bot.onText(/\/salir/, (msg, match) => {
  if (msg.chat.id !== MY_ID) return;
  picarSalida();
});

bot.onText(/\/pausa/, (msg, match) => {
  if (msg.chat.id !== MY_ID) return;
  picarParada();
});

bot.onText(/\/vuelta/, (msg, match) => {
  if (msg.chat.id !== MY_ID) return;
  picarVuelta();
});

cron.schedule("0 8 * * 1-5", () => {
  picarEntrada();
});

cron.schedule("0 17 * * 1-5", () => {
  picarSalida();
});

cron.schedule("0 13 * * 1-5", () => {
  picarParada();
});

cron.schedule("0 14 * * 1-5", () => {
  picarVuelta();
});

const sendMeMessage = text => {
  bot.sendMessage(MY_ID, text);
};
