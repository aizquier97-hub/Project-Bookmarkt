/* Waitlist form for bookmarkt.io. Posts straight to Supabase PostgREST
   with the publishable key; the waitlist_signups table accepts inserts
   from anon and nothing else (migration 20261005120000). */
(function () {
  "use strict";

  var SUPABASE_URL = "https://bfallxtcxxyykcnkedom.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NzMdHQACfZknql5bcdcExQ_ZI2KllTq";
  var ENDPOINT = SUPABASE_URL + "/rest/v1/waitlist_signups";
  var EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var form = document.getElementById("waitlist-form");
  var done = document.getElementById("form-done");
  if (!form || !done) return;

  var nameInput = document.getElementById("name");
  var emailInput = document.getElementById("email");
  var readingInput = document.getElementById("currently_reading");
  var honeypot = document.getElementById("website");
  var status = document.getElementById("form-status");
  var button = document.getElementById("submit-button");
  var doneTitle = document.getElementById("done-title");
  var doneCopy = document.getElementById("done-copy");

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function setBusy(busy) {
    button.disabled = busy;
    button.textContent = busy ? "Adding you\u2026" : "Join the waitlist";
  }

  function platformValue() {
    var checked = form.querySelector('input[name="platform"]:checked');
    return checked ? checked.value : "unsure";
  }

  function firstName(name) {
    return name.split(/\s+/)[0];
  }

  function showDone(name, alreadyListed) {
    doneTitle.textContent = alreadyListed
      ? "You were already on the list."
      : "You are on the list" + (name ? ", " + firstName(name) : "") + ".";
    doneCopy.textContent = alreadyListed
      ? "That address is already saved. We will write when a place opens."
      : "We will write when a place opens.";
    form.hidden = true;
    done.hidden = false;
    done.focus();
  }

  function messageFor(response, body) {
    if (response.status === 409) return null;
    if (body && body.hint === "waitlist_rate_limited") {
      return "The waitlist is busy right now. Please try again in a few minutes.";
    }
    if (response.status === 400 && body && body.code === "23514") {
      return "Please check your email address and try again.";
    }
    return "Something went wrong on our side. Please try again, or email support@bookmarkt.io.";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var name = nameInput.value.trim();
    var email = emailInput.value.trim().toLowerCase();
    var reading = readingInput.value.trim();

    if (honeypot.value) {
      showDone(name, false);
      return;
    }
    if (!name) {
      setStatus("Please tell us your name.", true);
      nameInput.focus();
      return;
    }
    if (!EMAIL_SHAPE.test(email)) {
      setStatus("Please enter a valid email address.", true);
      emailInput.focus();
      return;
    }

    var payload = {
      name: name,
      email: email,
      platform: platformValue(),
      currently_reading: reading || null
    };

    setStatus("", false);
    setBusy(true);

    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        if (response.status === 201) {
          showDone(name, false);
          return;
        }
        if (response.status === 409) {
          showDone(name, true);
          return;
        }
        return response
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            setStatus(messageFor(response, body), true);
            setBusy(false);
          });
      })
      .catch(function () {
        setStatus("We could not reach the server. Check your connection and try again.", true);
        setBusy(false);
      });
  });
})();
