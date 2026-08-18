/* Shared form handling for the Good Neighbor site.
 *
 * Everything lives inside this IIFE on purpose. A top-level
 * `var status = document.getElementById("status")` silently breaks, because
 * `status` at global scope IS the legacy `window.status` string property: the
 * element gets coerced to a string and every message the form tries to show is
 * swallowed. That shipped once already (caught 2026-08-17 by submitting the
 * real form in a browser, not by reading the source).
 */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------ *
   * WHERE SUBMISSIONS GO -- change these two lines and nothing else.
   *
   * "mailto" is the default because it needs no third-party account and no
   * secret in the page. The user sees exactly what is being sent and presses
   * send themselves, which is also the most privacy-respecting option while
   * there is no backend.
   *
   * To collect properly, set ENDPOINT to a Google Form `formResponse` URL (or
   * Formspree). Do NOT put an Airtable API key here -- this file is public, and
   * a write token in it would let anyone modify the base.
   * ------------------------------------------------------------------ */
  var ENDPOINT = "mailto";
  var OPS_EMAIL = "thegoodneighborapp0@gmail.com";

  function isEmail(value) {
    var at = value.indexOf("@");
    return at > 0 && value.lastIndexOf(".") > at + 1 && !/\s/.test(value);
  }

  function errorNode(input) {
    return document.getElementById("err-" + input.name);
  }

  function setError(input, message) {
    input.setAttribute("aria-invalid", "true");
    var node = errorNode(input);
    if (node) { node.textContent = message; }
  }

  function clearError(input) {
    input.removeAttribute("aria-invalid");
    var node = errorNode(input);
    if (node) { node.textContent = ""; }
  }

  /* Validate against the markup's own `required` / `type`, so a new field only
   * has to be added to the HTML -- there is no parallel list to keep in sync. */
  function validate(form) {
    var fields = form.querySelectorAll("input[name], select[name], textarea[name]");
    var firstBad = null;

    Array.prototype.forEach.call(fields, function (input) {
      clearError(input);
      var value = (input.type === "checkbox") ? input.checked : input.value.trim();

      if (input.hasAttribute("required") && !value) {
        setError(input, input.type === "checkbox"
          ? "Please confirm this to continue."
          : "This one's needed.");
        firstBad = firstBad || input;
        return;
      }
      if (input.type === "email" && value && !isEmail(value)) {
        setError(input, "That email doesn't look right — mind checking it?");
        firstBad = firstBad || input;
      }
    });

    return firstBad;
  }

  function collect(form) {
    var data = {};
    Array.prototype.forEach.call(
      form.querySelectorAll("input[name], select[name], textarea[name]"),
      function (input) {
        if (input.type === "checkbox") { data[input.name] = input.checked ? "yes" : "no"; }
        else { data[input.name] = input.value.trim(); }
      }
    );
    return data;
  }

  function asText(data) {
    return Object.keys(data).map(function (k) { return k + ": " + data[k]; }).join("\n");
  }

  function encodeForm(data) {
    return Object.keys(data).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(data[k]);
    }).join("&");
  }

  /* Capture the email the moment it is entered, not only on final submit.
   *
   * Putting the email first reduces drop-off on its own, but it only actually
   * WINS the lead if the address is banked before the person abandons the rest
   * of the form. So fire it on blur, once, as soon as it is valid.
   *
   * With ENDPOINT === "mailto" there is nothing to fire: a mail client cannot
   * be opened silently mid-form, and doing so would be hostile. Early capture
   * therefore only takes effect once a real endpoint is configured -- which is
   * one more reason to set one.
   */
  function wireEarlyCapture(form, fieldName, subject) {
    var input = form.elements[fieldName];
    if (!input || ENDPOINT === "mailto") { return; }
    var sent = false;

    input.addEventListener("blur", function () {
      var value = input.value.trim();
      if (sent || !value || !isEmail(value)) { return; }
      sent = true;
      global.fetch(ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encodeForm({ email: value, stage: "partial", source: subject })
      })["catch"](function () { sent = false; });   // let a later attempt retry
    });
  }

  function wire(options) {
    var form = document.getElementById(options.formId);
    var statusEl = document.getElementById(options.statusId);
    if (!form || !statusEl) { return; }

    form.setAttribute("novalidate", "novalidate");
    if (options.earlyCapture) {
      wireEarlyCapture(form, options.earlyCapture, options.subject);
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      statusEl.style.color = "";
      statusEl.textContent = "";

      var bad = validate(form);
      if (bad) {
        statusEl.style.color = "var(--err)";
        statusEl.textContent = "Almost — check the highlighted bits above.";
        if (typeof bad.focus === "function") { bad.focus(); }
        return;
      }

      var data = collect(form);

      if (ENDPOINT === "mailto") {
        global.location.href = "mailto:" + OPS_EMAIL +
          "?subject=" + encodeURIComponent(options.subject) +
          "&body=" + encodeURIComponent(asText(data));
        statusEl.textContent = "Opening your email app — just hit send and you're done.";
        return;
      }

      global.fetch(ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encodeForm(data)
      }).then(function () {
        form.style.display = "none";
        statusEl.textContent = options.done;
      })["catch"](function () {
        statusEl.style.color = "var(--err)";
        statusEl.textContent = "Something went wrong — please email " + OPS_EMAIL + " instead.";
      });
    });
  }

  global.GN = { wire: wire, isEmail: isEmail, endpoint: ENDPOINT, opsEmail: OPS_EMAIL };
})(window);
